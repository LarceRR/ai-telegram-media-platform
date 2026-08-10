import { Injectable } from '@nestjs/common';
import { ChannelMemberRole, ChannelStatus } from '@atmp/database';
import type { ChannelResponse } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditLogService } from '../../system/application/audit-log.service';
import type { AddMemberDto, CreateChannelDto, UpdateChannelDto, UpdateSettingsDto, UpsertCredentialReferenceDto } from '../presentation/dto/channel.dto';

const PROTECTED_FIELDS = new Set(['minEvidence', 'forbiddenTopics', 'legalRestrictions', 'blacklist', 'researchMaxLevel']);
const OPTIMIZABLE_FIELDS = new Set(['minInterest', 'minQuality', 'minOriginality', 'hookStyle', 'maxLength', 'emojiPolicy']);
const rank = { VIEWER: 0, EDITOR: 1, OPERATOR: 1, OWNER: 2 } as const;

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async create(actorExternalId: string, actorName: string, dto: CreateChannelDto): Promise<ChannelResponse> {
    const user = await this.prisma.user.upsert({ where: { email: actorExternalId }, update: { displayName: actorName }, create: { email: actorExternalId, displayName: actorName } });
    const channel = await this.prisma.channel.create({ data: { telegramId: dto.telegramChatId, title: dto.title, username: dto.username, language: dto.language ?? 'en', createdById: user.id, members: { create: { userId: user.id, role: ChannelMemberRole.OWNER } }, settings: { create: { mode: dto.mode ?? 'MODERATED' } } }, include: this.include(user.id) });
    const response = this.toResponse(channel, ChannelMemberRole.OWNER);
    await this.audit.record({ actorType: 'HUMAN', actorId: actorExternalId, action: 'channel.created', entityType: 'Channel', entityId: response.id, metadata: { mode: response.mode } });
    return response;
  }

  async list(actorExternalId: string): Promise<ChannelResponse[]> {
    const user = await this.prisma.user.findUnique({ where: { email: actorExternalId } });
    if (!user) return [];
    const channels = await this.prisma.channel.findMany({ where: { members: { some: { userId: user.id } } }, orderBy: { createdAt: 'desc' }, include: this.include(user.id) });
    return channels.map((channel) => this.toResponse(channel, channel.members[0]?.role ?? ChannelMemberRole.VIEWER));
  }

  async get(actorExternalId: string, id: string): Promise<ChannelResponse> {
    const channel = await this.authorizedChannel(actorExternalId, id, ChannelMemberRole.VIEWER);
    return this.toResponse(channel, channel.members[0]?.role ?? ChannelMemberRole.VIEWER);
  }

  async update(actorExternalId: string, id: string, dto: UpdateChannelDto): Promise<ChannelResponse> {
    const current = await this.authorizedChannel(actorExternalId, id, ChannelMemberRole.EDITOR);
    const { mode, active, ...channelData } = dto;
    const updated = await this.prisma.$transaction(async (tx) => {
      const channel = await tx.channel.update({ where: { id }, data: { ...channelData, ...(active === undefined ? {} : { status: active ? ChannelStatus.ACTIVE : ChannelStatus.PAUSED }) }, include: this.include(current.members[0]?.role ? undefined : undefined) });
      if (mode !== undefined) await tx.channelSettings.update({ where: { channelId: id }, data: { mode } });
      return tx.channel.findUniqueOrThrow({ where: { id }, include: this.include(current.members[0]?.userId) });
    });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorExternalId, action: 'channel.updated', entityType: 'Channel', entityId: id, metadata: { fields: Object.keys(dto) } });
    return this.toResponse(updated, current.members[0]?.role ?? ChannelMemberRole.EDITOR);
  }

  async updateSettings(actorExternalId: string, id: string, dto: UpdateSettingsDto): Promise<ChannelResponse> {
    const current = await this.authorizedChannel(actorExternalId, id, ChannelMemberRole.EDITOR);
    const role = current.members[0]?.role ?? ChannelMemberRole.VIEWER;
    const changed = Object.keys(dto).filter((key) => key !== 'expectedVersion');
    if (role !== ChannelMemberRole.OWNER && changed.some((key) => PROTECTED_FIELDS.has(key))) throw new AppError('FORBIDDEN', 'Only channel owners can change protected settings');
    if (changed.some((key) => !PROTECTED_FIELDS.has(key) && !OPTIMIZABLE_FIELDS.has(key))) throw new AppError('VALIDATION', 'Unknown settings field');
    const { expectedVersion: _expectedVersion, emojiPolicy, hookStyle, ...values } = dto;
    const data = { ...values, ...(emojiPolicy === undefined ? {} : { emojiEnabled: emojiPolicy }), ...(hookStyle === undefined ? {} : { styleConfig: { hookStyle } }), version: { increment: 1 } };
    const result = await this.prisma.channelSettings.updateMany({ where: { channelId: id, version: dto.expectedVersion }, data });
    if (result.count !== 1) throw new AppError('CONFLICT', 'Settings version is stale; reload before updating');
    const updated = await this.prisma.channel.findUniqueOrThrow({ where: { id }, include: this.include(current.members[0]?.userId) });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorExternalId, action: 'channel.settings.updated', entityType: 'ChannelSettings', entityId: id, metadata: { fields: changed, version: dto.expectedVersion + 1 } });
    return this.toResponse(updated, role);
  }

  async addMember(actorExternalId: string, id: string, dto: AddMemberDto): Promise<void> {
    const channel = await this.authorizedChannel(actorExternalId, id, ChannelMemberRole.OWNER);
    const user = await this.prisma.user.upsert({ where: { email: dto.externalId }, update: { displayName: dto.displayName }, create: { email: dto.externalId, displayName: dto.displayName } });
    await this.prisma.channelMember.upsert({ where: { channelId_userId: { channelId: id, userId: user.id } }, update: { role: dto.role }, create: { channelId: id, userId: user.id, role: dto.role } });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorExternalId, action: 'channel.member.upserted', entityType: 'ChannelMember', entityId: channel.id, metadata: { memberExternalId: dto.externalId, role: dto.role } });
  }

  async upsertCredential(actorExternalId: string, id: string, dto: UpsertCredentialReferenceDto): Promise<void> {
    const channel = await this.authorizedChannel(actorExternalId, id, ChannelMemberRole.OWNER);
    if (/token|secret|password|api[_-]?key|bot\d*:/i.test(dto.reference)) throw new AppError('VALIDATION', 'Store a secret-manager reference, never a credential value');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { email: actorExternalId } });
    await this.prisma.sourceCredentialRef.upsert({ where: { channelId: id }, update: { secretRef: dto.reference, provider: 'TELEGRAM_BOT' }, create: { channelId: id, provider: 'TELEGRAM_BOT', secretRef: dto.reference, createdById: user.id } });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorExternalId, action: 'channel.credential_reference.updated', entityType: 'CredentialReference', entityId: channel.id, metadata: { provider: dto.provider } });
  }

  private include(userId?: string) {
    return { settings: true, members: { ...(userId ? { where: { userId } } : {}), select: { role: true, userId: true } }, credential: { select: { id: true } } } as const;
  }

  private async authorizedChannel(actorExternalId: string, id: string, minimum: ChannelMemberRole) {
    const user = await this.prisma.user.findUnique({ where: { email: actorExternalId } });
    const channel = user ? await this.prisma.channel.findFirst({ where: { id, members: { some: { userId: user.id } } }, include: this.include(user.id) }) : null;
    if (!channel) throw new AppError('NOT_FOUND', 'Channel not found');
    const role = channel.members[0]?.role;
    if (!role || rank[role] < rank[minimum]) throw new AppError('FORBIDDEN', 'Insufficient channel permissions');
    return channel;
  }

  private toResponse(channel: any, role: ChannelMemberRole): ChannelResponse {
    const settings = channel.settings;
    if (!settings) throw new AppError('INTERNAL', 'Channel settings are missing');
    const style = settings.styleConfig as { hookStyle?: string };
    return { id: channel.id, telegramChatId: channel.telegramId, title: channel.title, username: channel.username, language: channel.language, mode: settings.mode, active: channel.status === ChannelStatus.ACTIVE, role, settings: { minInterest: settings.minInterest, minQuality: settings.minQuality, minEvidence: settings.minEvidence, minOriginality: settings.minOriginality, researchMaxLevel: settings.researchMaxLevel, forbiddenTopics: settings.forbiddenTopics as string[], legalRestrictions: settings.legalRestrictions as string[], blacklist: settings.blacklist as string[], hookStyle: style.hookStyle ?? 'restrained', maxLength: settings.maxLength ?? 4000, emojiPolicy: settings.emojiEnabled, version: settings.version }, telegramCredentialConfigured: Boolean(channel.credential), createdAt: channel.createdAt.toISOString(), updatedAt: channel.updatedAt.toISOString() };
  }
}
