import { Injectable } from '@nestjs/common';
import { ChannelMemberRole, Prisma } from '@atmp/database';
import type { ChannelResponse } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditLogService } from '../../system/application/audit-log.service';
import type {
  AddMemberDto,
  CreateChannelDto,
  CredentialRefDto,
  UpdateChannelDto,
  UpdateSettingsDto,
} from '../presentation/dto/channel.dto';

const protectedFields = new Set([
  'minEvidence',
  'forbiddenTopics',
  'legalRestrictions',
  'researchMaxLevel',
]);
const rank = { VIEWER: 0, EDITOR: 1, OPERATOR: 1, OWNER: 2 } as const;

type ChannelWithRelations = Prisma.ChannelGetPayload<{
  include: {
    settings: true;
    members: { select: { role: true; userId: true } };
    credential: { select: { id: true } };
  };
}>;

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}
  private actor(value: string) {
    return this.prisma.user.findFirst({ where: { OR: [{ id: value }, { email: value }] } });
  }
  async create(
    actorValue: string,
    actorName: string,
    dto: CreateChannelDto,
  ): Promise<ChannelResponse> {
    const user = await this.actor(actorValue);
    if (!user) throw new AppError('UNAUTHORIZED', 'Unknown actor');
    const channel = await this.prisma.channel.create({
      data: {
        telegramId: dto.telegramId,
        title: dto.title,
        username: dto.username,
        language: dto.language ?? 'en',
        createdById: user.id,
        members: { create: { userId: user.id, role: ChannelMemberRole.OWNER } },
        settings: { create: {} },
      },
      include: this.include(user.id),
    });
    const response = this.toResponse(channel, ChannelMemberRole.OWNER);
    await this.audit.record({
      actorType: 'HUMAN',
      actorId: user.id,
      action: 'channel.created',
      entityType: 'Channel',
      entityId: response.id,
    });
    return response;
  }
  async list(actorValue: string) {
    const user = await this.actor(actorValue);
    if (!user) return [];
    const rows = await this.prisma.channel.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { createdAt: 'desc' },
      include: this.include(user.id),
    });
    return rows.map((row) =>
      this.toResponse(row, row.members[0]?.role ?? ChannelMemberRole.VIEWER),
    );
  }
  async get(actorValue: string, id: string) {
    const row = await this.authorized(actorValue, id, ChannelMemberRole.VIEWER);
    return this.toResponse(row, row.members[0]?.role ?? ChannelMemberRole.VIEWER);
  }
  async update(actorValue: string, id: string, dto: UpdateChannelDto) {
    const current = await this.authorized(actorValue, id, ChannelMemberRole.EDITOR);
    const row = await this.prisma.channel.update({
      where: { id },
      data: dto as Prisma.ChannelUpdateInput,
      include: this.include(current.members[0]?.userId),
    });
    return this.toResponse(row, current.members[0]?.role ?? ChannelMemberRole.EDITOR);
  }
  async updateSettings(actorValue: string, id: string, dto: UpdateSettingsDto) {
    const current = await this.authorized(actorValue, id, ChannelMemberRole.EDITOR);
    const role = current.members[0]?.role ?? ChannelMemberRole.VIEWER;
    const changed = Object.keys(dto).filter((key) => key !== 'expectedVersion');
    if (role !== ChannelMemberRole.OWNER && changed.some((key) => protectedFields.has(key)))
      throw new AppError('FORBIDDEN', 'Only owners can change protected settings');
    const { expectedVersion, ...settingsData } = dto;
    const result = await this.prisma.channelSettings.updateMany({
      where: { channelId: id, version: expectedVersion },
      data: {
        ...settingsData,
        version: { increment: 1 },
      } as Prisma.ChannelSettingsUpdateManyMutationInput,
    });
    if (result.count !== 1) throw new AppError('CONFLICT', 'Settings version is stale');
    const row = await this.prisma.channel.findUniqueOrThrow({
      where: { id },
      include: this.include(current.members[0]?.userId),
    });
    return this.toResponse(row, role);
  }
  async addMember(actorValue: string, id: string, dto: AddMemberDto) {
    const channel = await this.authorized(actorValue, id, ChannelMemberRole.OWNER);
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId: id, userId: user.id } },
      update: { role: dto.role },
      create: { channelId: id, userId: user.id, role: dto.role },
    });
    await this.audit.record({
      actorType: 'HUMAN',
      actorId: channel.createdById,
      action: 'channel.member.upserted',
      entityType: 'ChannelMember',
      entityId: channel.id,
    });
  }
  async setCredential(actorValue: string, id: string, dto: CredentialRefDto) {
    const channel = await this.authorized(actorValue, id, ChannelMemberRole.OWNER);
    if (/token|password|api[_-]?key|bot\d*:/i.test(dto.secretRef))
      throw new AppError('VALIDATION', 'Only a secret-manager reference is accepted');
    const user = await this.actor(actorValue);
    if (!user) throw new AppError('UNAUTHORIZED', 'Unknown actor');
    await this.prisma.sourceCredentialRef.upsert({
      where: { channelId: id },
      update: { secretRef: dto.secretRef },
      create: {
        channelId: id,
        provider: 'TELEGRAM_BOT',
        secretRef: dto.secretRef,
        createdById: user.id,
      },
    });
    await this.audit.record({
      actorType: 'HUMAN',
      actorId: user.id,
      action: 'channel.credential_reference.updated',
      entityType: 'SourceCredentialRef',
      entityId: channel.id,
    });
    return { secretRef: dto.secretRef };
  }
  private include(userId?: string) {
    return {
      settings: true,
      members: { ...(userId ? { where: { userId } } : {}), select: { role: true, userId: true } },
      credential: { select: { id: true } },
    } as const;
  }
  private async authorized(actorValue: string, id: string, minimum: ChannelMemberRole) {
    const user = await this.actor(actorValue);
    const row = user
      ? await this.prisma.channel.findFirst({
          where: { id, members: { some: { userId: user.id } } },
          include: this.include(user.id),
        })
      : null;
    if (!row) throw new AppError('FORBIDDEN', 'Channel access denied');
    const role = row.members[0]?.role;
    if (!role || rank[role] < rank[minimum])
      throw new AppError('FORBIDDEN', 'Insufficient channel permissions');
    return row;
  }
  private toResponse(channel: ChannelWithRelations, role: ChannelMemberRole): ChannelResponse {
    const settings = channel.settings;
    if (!settings) throw new AppError('INTERNAL', 'Channel settings missing');
    return {
      id: channel.id,
      telegramId: channel.telegramId,
      title: channel.title,
      username: channel.username,
      language: channel.language,
      status: channel.status,
      role,
      settings: {
        mode: settings.mode,
        timezone: settings.timezone,
        minInterest: settings.minInterest,
        minQuality: settings.minQuality,
        minEvidence: settings.minEvidence,
        minOriginality: settings.minOriginality,
        researchMaxLevel: settings.researchMaxLevel,
        minLength: settings.minLength,
        maxLength: settings.maxLength,
        emojiEnabled: settings.emojiEnabled,
        forbiddenTopics: settings.forbiddenTopics as string[],
        legalRestrictions: settings.legalRestrictions as string[],
        sourcePriorities: settings.sourcePriorities as Record<string, number>,
        styleConfig: settings.styleConfig as Record<string, unknown>,
        version: settings.version,
      },
      telegramCredentialConfigured: Boolean(channel.credential),
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
      version: settings.version,
    };
  }
}
