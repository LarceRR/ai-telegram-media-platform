import { Injectable } from '@nestjs/common';
import { ChannelMemberRole, Prisma } from '@atmp/database';
import type { IngestSourceJob, SourceResponse } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { QueueRegistry } from '../../../infrastructure/queue/queue.registry';
import { AuditLogService } from '../../system/application/audit-log.service';
import { adapterFor } from '../infrastructure/source-adapter';
import type { CreateSourceDto, UpdateSourceDto } from '../presentation/dto/source.dto';

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueRegistry,
    private readonly audit: AuditLogService,
  ) {}
  private async user(value: string) {
    return this.prisma.user.findFirst({ where: { OR: [{ id: value }, { email: value }] } });
  }
  private async access(
    actor: string,
    channelId: string,
    role: ChannelMemberRole = ChannelMemberRole.VIEWER,
  ) {
    const user = await this.user(actor);
    const row = user
      ? await this.prisma.channelMember.findFirst({ where: { channelId, userId: user.id } })
      : null;
    const writeRoles: ChannelMemberRole[] = [ChannelMemberRole.OWNER, ChannelMemberRole.EDITOR];
    if (!row || (role === ChannelMemberRole.EDITOR && !writeRoles.includes(row.role)))
      throw new AppError('FORBIDDEN', 'Channel access denied');
    return user!;
  }
  async list(actor: string, channelId: string): Promise<SourceResponse[]> {
    await this.access(actor, channelId);
    const rows = await this.prisma.channelSource.findMany({
      where: { channelId },
      include: {
        source: { include: { healthSnapshots: { orderBy: { checkedAt: 'desc' }, take: 1 } } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) =>
      this.response(
        row.source,
        channelId,
        row.priority,
        row.source.healthSnapshots[0]?.status ?? null,
      ),
    );
  }
  async create(actor: string, channelId: string, dto: CreateSourceDto): Promise<SourceResponse> {
    const user = await this.access(actor, channelId, ChannelMemberRole.EDITOR);
    const source = await this.prisma.source.upsert({
      where: { type_url: { type: dto.type, url: dto.url } },
      update: { name: dto.name },
      create: { name: dto.name, type: dto.type, url: dto.url },
    });
    const link = await this.prisma.channelSource.upsert({
      where: { channelId_sourceId: { channelId, sourceId: source.id } },
      update: { priority: dto.priority ?? 0, enabled: true },
      create: { channelId, sourceId: source.id, priority: dto.priority ?? 0 },
    });
    await this.audit.record({
      actorType: 'HUMAN',
      actorId: user.id,
      action: 'source.created_or_bound',
      entityType: 'Source',
      entityId: source.id,
      metadata: { channelId, type: dto.type },
    });
    return this.response(source, channelId, link.priority, null);
  }
  async update(
    actor: string,
    channelId: string,
    id: string,
    dto: UpdateSourceDto,
  ): Promise<SourceResponse> {
    const user = await this.access(actor, channelId, ChannelMemberRole.EDITOR);
    const link = await this.prisma.channelSource.findFirst({
      where: { channelId, sourceId: id },
      include: { source: true },
    });
    if (!link) throw new AppError('NOT_FOUND', 'Source not found');
    const source = await this.prisma.source.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.url ? { url: dto.url } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    if (dto.priority !== undefined)
      await this.prisma.channelSource.update({
        where: { id: link.id },
        data: { priority: dto.priority },
      });
    await this.audit.record({
      actorType: 'HUMAN',
      actorId: user.id,
      action: 'source.updated',
      entityType: 'Source',
      entityId: id,
      metadata: { channelId },
    });
    return this.response(source, channelId, dto.priority ?? link.priority, null);
  }
  async enqueue(actor: string, channelId: string, id: string): Promise<{ jobId: string }> {
    await this.access(actor, channelId, ChannelMemberRole.EDITOR);
    const link = await this.prisma.channelSource.findFirst({
      where: { channelId, sourceId: id, enabled: true },
      include: { source: true },
    });
    if (!link) throw new AppError('NOT_FOUND', 'Enabled source not found');
    const correlationId = crypto.randomUUID();
    const payload: IngestSourceJob = {
      correlationId,
      enqueuedAt: new Date().toISOString(),
      enqueuedBy: 'api',
      attemptHint: 0,
      sourceId: id,
      channelId,
    };
    const jobId = await this.queue.enqueue(
      'ingestion',
      'sources.ingest',
      payload,
      `ingest:${id}:${channelId}`,
    );
    return { jobId };
  }
  async process(job: IngestSourceJob): Promise<void> {
    const source = await this.prisma.source.findUnique({ where: { id: job.sourceId } });
    if (!source || source.status !== 'ACTIVE') return;
    const started = Date.now();
    try {
      const items = await adapterFor(source.type).fetch(
        { type: source.type, url: source.url },
        source.lastCursor ?? undefined,
      );
      for (const item of items) {
        const normalized = item.text.trim().replace(/\s+/g, ' ');
        const contentHash = createHash('sha256').update(normalized.toLowerCase()).digest('hex');
        await this.prisma.sourceItem.upsert({
          where: {
            sourceId_externalItemId: { sourceId: source.id, externalItemId: item.externalItemId },
          },
          update: {
            title: item.title,
            text: item.text,
            normalizedText: normalized,
            canonicalUrl: item.canonicalUrl,
            author: item.author,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            images: {
              deleteMany: {},
              create: item.images.map((image) => ({ url: image.url, alt: image.alt })),
            },
          },
          create: {
            sourceId: source.id,
            externalItemId: item.externalItemId,
            canonicalUrl: item.canonicalUrl,
            contentHash,
            title: item.title,
            author: item.author,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            text: item.text,
            normalizedText: normalized,
            images: { create: item.images.map((image) => ({ url: image.url, alt: image.alt })) },
          },
        });
      }
      await this.prisma.source.update({
        where: { id: source.id },
        data: { lastIngestedAt: new Date() },
      });
      await this.prisma.sourceHealthSnapshot.create({
        data: {
          sourceId: source.id,
          status: 'HEALTHY',
          latencyMs: Date.now() - started,
          httpStatus: 200,
        },
      });
    } catch (error) {
      await this.prisma.sourceHealthSnapshot.create({
        data: {
          sourceId: source.id,
          status: 'FAILED',
          latencyMs: Date.now() - started,
          errorCategory: 'ADAPTER_ERROR',
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        },
      });
      throw error;
    }
  }
  private response(
    source: any,
    channelId: string,
    priority: number,
    health: string | null,
  ): SourceResponse {
    return {
      id: source.id,
      channelId,
      name: source.name,
      type: source.type,
      url: source.url,
      status: source.status,
      priority,
      lastIngestedAt: source.lastIngestedAt?.toISOString() ?? null,
      lastHealthStatus: health,
    };
  }
}
