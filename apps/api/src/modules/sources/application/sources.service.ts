import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ChannelMemberRole, Prisma, type Source } from '@atmp/database';
import {
  JOB_NAMES_SOURCES,
  idempotencyKeys,
  type IngestSourceJob,
  type SourceHealthStatus,
  type SourceItemPayload,
  type SourceResponse,
} from '@atmp/contracts';
import { AppError, toErrorCategory } from '@atmp/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { QueueRegistry } from '../../../infrastructure/queue/queue.registry';
import { AuditLogService } from '../../system/application/audit-log.service';
import type { SourceHealthReport } from '../domain/source-adapter';
import { SourceAdapterRegistry } from '../infrastructure/source-adapter.registry';
import { httpStatusFromError } from '../infrastructure/adapters/source-health';
import type { CreateSourceDto, UpdateSourceDto } from '../presentation/dto/source.dto';

export interface IngestAccepted {
  sourceId: string;
  jobId: string;
}

export interface IngestAllResult {
  sourceId: string;
  jobId: string | null;
  error: string | null;
}

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueRegistry,
    private readonly audit: AuditLogService,
    private readonly adapters: SourceAdapterRegistry,
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
      this.response(row.source, channelId, {
        priority: row.priority,
        enabled: row.enabled,
        health: row.source.healthSnapshots[0]?.status ?? null,
      }),
    );
  }

  async create(actor: string, channelId: string, dto: CreateSourceDto): Promise<SourceResponse> {
    const user = await this.access(actor, channelId, ChannelMemberRole.EDITOR);
    const source = await this.prisma.source.upsert({
      where: { type_url: { type: dto.type, url: dto.url } },
      update: {
        name: dto.name,
        ...(dto.categories ? { categories: dto.categories } : {}),
      },
      create: {
        name: dto.name,
        type: dto.type,
        url: dto.url,
        categories: dto.categories ?? [],
      },
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
    return this.response(source, channelId, {
      priority: link.priority,
      enabled: link.enabled,
      health: null,
    });
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
        ...(dto.categories ? { categories: dto.categories } : {}),
      },
    });

    let binding = { priority: link.priority, enabled: link.enabled };
    if (dto.priority !== undefined || dto.enabled !== undefined) {
      const updated = await this.prisma.channelSource.update({
        where: { id: link.id },
        data: {
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        },
      });
      binding = { priority: updated.priority, enabled: updated.enabled };
    }

    await this.audit.record({
      actorType: 'HUMAN',
      actorId: user.id,
      action: 'source.updated',
      entityType: 'Source',
      entityId: id,
      metadata: { channelId, enabled: dto.enabled ?? null, status: dto.status ?? null },
    });
    return this.response(source, channelId, { ...binding, health: null });
  }

  /**
   * Queues one ingestion run.
   *
   * The idempotency key is bucketed by the adapter's minimum interval, so a
   * retry inside the window collapses onto the queued job while a trigger in a
   * later window is genuinely new work.
   */
  async enqueue(actor: string, channelId: string, id: string): Promise<IngestAccepted> {
    await this.access(actor, channelId, ChannelMemberRole.EDITOR);
    const link = await this.prisma.channelSource.findFirst({
      where: { channelId, sourceId: id, enabled: true },
      include: { source: true },
    });
    if (!link) throw new AppError('NOT_FOUND', 'Enabled source not found');
    if (link.source.status !== 'ACTIVE') {
      throw new AppError('CONFLICT', `Source is ${link.source.status.toLowerCase()}`);
    }

    const { minIntervalMs } = this.adapters.rateLimitFor(link.source.type);
    const windowStart = new Date(
      Math.floor(Date.now() / minIntervalMs) * minIntervalMs,
    ).toISOString();

    const payload: IngestSourceJob = {
      correlationId: crypto.randomUUID(),
      enqueuedAt: new Date().toISOString(),
      enqueuedBy: 'api',
      attemptHint: 0,
      sourceId: id,
      channelId,
      ...(link.source.lastCursor ? { cursor: link.source.lastCursor } : {}),
    };

    const jobId = await this.queue.enqueue(
      'ingestion',
      JOB_NAMES_SOURCES.ingestSource,
      payload,
      idempotencyKeys.ingestionRun(id, channelId, windowStart),
    );
    return { sourceId: id, jobId };
  }

  /**
   * Queues every enabled source of a channel independently: one unusable source
   * reports its own error and never prevents the others from being ingested.
   */
  async ingestAll(actor: string, channelId: string): Promise<IngestAllResult[]> {
    await this.access(actor, channelId, ChannelMemberRole.EDITOR);
    const links = await this.prisma.channelSource.findMany({
      where: { channelId, enabled: true, source: { status: 'ACTIVE' } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      select: { sourceId: true },
    });

    const settled = await Promise.allSettled(
      links.map((link) => this.enqueue(actor, channelId, link.sourceId)),
    );

    return settled.map((result, index) => {
      const sourceId = links[index]?.sourceId ?? '';
      if (result.status === 'fulfilled') {
        return { sourceId, jobId: result.value.jobId, error: null };
      }
      const reason: unknown = result.reason;
      return {
        sourceId,
        jobId: null,
        error: reason instanceof Error ? reason.message : 'Failed to enqueue ingestion',
      };
    });
  }

  /** Live probe. Records a snapshot so operators see probe history, not just runs. */
  async health(actor: string, channelId: string, id: string): Promise<SourceHealthReport> {
    await this.access(actor, channelId);
    const link = await this.prisma.channelSource.findFirst({
      where: { channelId, sourceId: id },
      include: { source: true },
    });
    if (!link) throw new AppError('NOT_FOUND', 'Source not found');

    const report = await this.adapters
      .get(link.source.type)
      .health({ type: link.source.type, url: link.source.url });
    await this.snapshot(link.sourceId, report);
    return report;
  }

  async process(job: IngestSourceJob): Promise<void> {
    const source = await this.prisma.source.findUnique({ where: { id: job.sourceId } });
    if (!source || source.status !== 'ACTIVE') return;

    const adapter = this.adapters.get(source.type);
    const started = Date.now();

    try {
      const result = await adapter.fetch(
        { type: source.type, url: source.url },
        source.lastCursor ?? undefined,
      );

      let duplicates = 0;
      for (const item of result.items) {
        if ((await this.persistItem(source.id, item)) === 'duplicate') duplicates += 1;
      }

      await this.prisma.source.update({
        where: { id: source.id },
        data: { lastIngestedAt: new Date(), lastCursor: result.cursor },
      });

      const quarantined = result.quarantined;
      await this.snapshot(source.id, {
        status: quarantined.length > 0 ? 'DEGRADED' : 'HEALTHY',
        latencyMs: Date.now() - started,
        httpStatus: result.httpStatus,
        errorCategory: quarantined.length > 0 ? 'MALFORMED_ITEM' : null,
        errorMessage: describeRun(
          quarantined.map((entry) => entry.reason),
          duplicates,
        ),
      });
    } catch (error) {
      await this.snapshot(source.id, {
        status: 'FAILED',
        latencyMs: Date.now() - started,
        httpStatus: httpStatusFromError(error),
        errorCategory: toErrorCategory(error),
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
      });
      // Rethrow so the queue applies the retry policy to this source alone.
      throw error;
    }
  }

  /**
   * Upsert by `(sourceId, externalItemId)`.
   *
   * The schema also enforces `(sourceId, contentHash)`. A collision there means
   * the same content arrived under a new external id, which is deduplication
   * working as designed, not a failure worth retrying.
   */
  private async persistItem(
    sourceId: string,
    item: SourceItemPayload,
  ): Promise<'stored' | 'duplicate'> {
    const normalizedText = item.text.trim().replace(/\s+/g, ' ');
    const contentHash = createHash('sha256').update(normalizedText.toLowerCase()).digest('hex');
    const images = item.images.map((image) => ({ url: image.url, alt: image.alt ?? null }));
    const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;

    try {
      await this.prisma.sourceItem.upsert({
        where: { sourceId_externalItemId: { sourceId, externalItemId: item.externalItemId } },
        update: {
          canonicalUrl: item.canonicalUrl,
          title: item.title,
          author: item.author ?? null,
          publishedAt,
          text: item.text,
          normalizedText,
          contentHash,
          images: { deleteMany: {}, create: images },
        },
        create: {
          sourceId,
          externalItemId: item.externalItemId,
          canonicalUrl: item.canonicalUrl,
          contentHash,
          title: item.title,
          author: item.author ?? null,
          publishedAt,
          text: item.text,
          normalizedText,
          images: { create: images },
        },
      });
      return 'stored';
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return 'duplicate';
      }
      throw error;
    }
  }

  private async snapshot(sourceId: string, report: SourceHealthReport): Promise<void> {
    await this.prisma.sourceHealthSnapshot.create({
      data: {
        sourceId,
        status: report.status,
        latencyMs: report.latencyMs,
        httpStatus: report.httpStatus,
        errorCategory: report.errorCategory,
        errorMessage: report.errorMessage,
      },
    });
  }

  private response(
    source: Source,
    channelId: string,
    binding: { priority: number; enabled: boolean; health: SourceHealthStatus | null },
  ): SourceResponse {
    return {
      id: source.id,
      channelId,
      name: source.name,
      type: source.type,
      url: source.url,
      status: source.status,
      categories: source.categories,
      priority: binding.priority,
      enabled: binding.enabled,
      lastIngestedAt: source.lastIngestedAt?.toISOString() ?? null,
      lastHealthStatus: binding.health,
    };
  }
}

function describeRun(reasons: readonly string[], duplicates: number): string | null {
  if (reasons.length > 0) return reasons.join(' | ').slice(0, 500);
  if (duplicates > 0) return `${duplicates} duplicate item(s) skipped`;
  return null;
}
