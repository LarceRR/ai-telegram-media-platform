import { Injectable } from '@nestjs/common';
import { ChannelMemberRole, ChannelStatus } from '@atmp/database';
import type { ChannelResponse } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditLogService } from '../../system/application/audit-log.service';
import type { AddMemberDto, CreateChannelDto, CredentialRefDto, UpdateChannelDto, UpdateSettingsDto } from '../presentation/dto/channel.dto';

const protectedFields = new Set(['minEvidence', 'forbiddenTopics', 'legalRestrictions', 'researchMaxLevel']);
const rank = { VIEWER: 0, EDITOR: 1, OPERATOR: 1, OWNER: 2 } as const;

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async create(actorEmail: string, actorName: string, dto: CreateChannelDto): Promise<ChannelResponse> {
    const user = await this.prisma.user.upsert({ where: { email: actorEmail }, update: { displayName: actorName }, create: { email: actorEmail, displayName: actorName } });
    const channel = await this.prisma.channel.create({ data: { telegramId: dto.telegramId, title: dto.title, username: dto.username, language: dto.language ?? 'en', createdById: user.id, members: { create: { userId: user.id, role: ChannelMemberRole.OWNER } }, settings: { create: {} } }, include: this.include(user.id) });
    const response = this.toResponse(channel, ChannelMemberRole.OWNER);
    await this.audit.record({ actorType: 'HUMAN', actorId: actorEmail, action: 'channel.created', entityType: 'Channel', entityId: response.id, metadata: { telegramId: dto.telegramId } });
    return response;
  }

  async list(actorEmail: string): Promise<ChannelResponse[]> {
    const user = await this.prisma.user.findUnique({ where: { email: actorEmail } });
    if (!user) return [];
    const channels = await this.prisma.channel.findMany({ where: { members: { some: { userId: user.id } } }, orderBy: { createdAt: 'desc' }, include: this.include(user.id) });
    return channels.map((channel) => this.toResponse(channel, channel.members[0]?.role ?? ChannelMemberRole.VIEWER));
  }

  async get(actorEmail: string, id: string): Promise<ChannelResponse> {
    const channel = await this.authorized(actorEmail, id, ChannelMemberRole.VIEWER);
    return this.toResponse(channel, channel.members[0]?.role ?? ChannelMemberRole.VIEWER);
  }

  async update(actorEmail: string, id: string, dto: UpdateChannelDto): Promise<ChannelResponse> {
    const current = await this.authorized(actorEmail, id, ChannelMemberRole.EDITOR);
    const updated = await this.prisma.channel.update({ where: { id }, data: dto, include: this.include(current.members[0]?.userId) });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorEmail, action: 'channel.updated', entityType: 'Channel', entityId: id, metadata: { fields: Object.keys(dto) } });
    return this.toResponse(updated, current.members[0]?.role ?? ChannelMemberRole.EDITOR);
  }

  async updateSettings(actorEmail: string, id: string, dto: UpdateSettingsDto): Promise<ChannelResponse> {
    const current = await this.authorized(actorEmail, id, ChannelMemberRole.EDITOR);
    const role = current.members[0]?.role ?? ChannelMemberRole.VIEWER;
    const changed = Object.keys(dto).filter((key) => key !== 'expectedVersion');
    if (role !== ChannelMemberRole.OWNER && changed.some((key) => protectedFields.has(key))) throw new AppError('FORBIDDEN', 'Only channel owners can change protected settings');
    const { expectedVersion, ...settingsData } = dto;
    const result = await this.prisma.channelSettings.updateMany({ where: { channelId: id, version: expectedVersion }, data: { ...settingsData, version: { increment: 1 } } });
    if (result.count !== 1) throw new AppError('CONFLICT', 'Settings version is stale; reload before updating');
    const updated = await this.prisma.channel.findUniqueOrThrow({ where: { id }, include: this.include(current.members[0]?.userId) });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorEmail, action: 'channel.settings.updated', entityType: 'ChannelSettings', entityId: id, metadata: { fields: changed, version: expectedVersion + 1 } });
    return this.toResponse(updated, role);
  }

  async addMember(actorEmail: string, id: string, dto: AddMemberDto): Promise<void> {
    const channel = await this.authorized(actorEmail, id, ChannelMemberRole.OWNER);
    const user = await this.prisma.user.upsert({ where: { email: dto.userId }, update: {}, create: { email: dto.userId, displayName: dto.userId } });
    await this.prisma.channelMember.upsert({ where: { channelId_userId: { channelId: id, userId: user.id } }, update: { role: dto.role }, create: { channelId: id, userId: user.id, role: dto.role } });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorEmail, action: 'channel.member.upserted', entityType: 'ChannelMember', entityId: channel.id, metadata: { userId: dto.userId, role: dto.role } });
  }

  async setCredential(actorEmail: string, id: string, dto: CredentialRefDto): Promise<void> {
    const channel = await this.authorized(actorEmail, id, ChannelMemberRole.OWNER);
    if (/token|secret|password|api[_-]?key|bot\d*:/i.test(dto.secretRef)) throw new AppError('VALIDATION', 'Store a secret-manager reference, never a credential value');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { email: actorEmail } });
    await this.prisma.sourceCredentialRef.upsert({ where: { channelId: id }, update: { secretRef: dto.secretRef }, create: { channelId: id, provider: 'TELEGRAM_BOT', secretRef: dto.secretRef, createdById: user.id } });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorEmail, action: 'channel.credential_reference.updated', entityType: 'SourceCredentialRef', entityId: channel.id, metadata: { provider: 'TELEGRAM_BOT' } });
  }

  private include(userId?: string) {
    return { settings: true, members: { ...(userId ? { where: { userId } } : {}), select: { role: true, userId: true } }, credential: { select: { id: true } } } as const;
  }

  private async authorized(actorEmail: string, id: string, minimum: ChannelMemberRole) {
    const user = await this.prisma.user.findUnique({ where: { email: actorEmail } });
    const channel = user ? await this.prisma.channel.findFirst({ where: { id, members: { some: { userId: user.id } } }, include: this.include(user.id) }) : null;
    if (!channel) throw new AppError('NOT_FOUND', 'Channel not found');
    const role = channel.members[0]?.role;
    if (!role || rank[role] < rank[minimum]) throw new AppError('FORBIDDEN', 'Insufficient channel permissions');
    return channel;
  }

  private toResponse(channel: any, role: ChannelMemberRole): ChannelResponse {
    if (!channel.settings) throw new AppError('INTERNAL', 'Channel settings are missing');
    return { id: channel.id, telegramId: channel.telegramId, title: channel.title, username: channel.username, language: channel.language, status: channel.status, role, settings: { mode: channel.settings.mode, timezone: channel.settings.timezone, minInterest: channel.settings.minInterest, minQuality: channel.settings.minQuality, minEvidence: channel.settings.minEvidence, minOriginality: channel.settings.minOriginality, researchMaxLevel: channel.settings.researchMaxLevel, minLength: channel.settings.minLength, maxLength: channel.settings.maxLength, emojiEnabled: channel.settings.emojiEnabled, forbiddenTopics: channel.settings.forbiddenTopics as string[], legalRestrictions: channel.settings.legalRestrictions as string[], sourcePriorities: channel.settings.sourcePriorities as Record<string, number>, styleConfig: channel.settings.styleConfig as Record<string, unknown>, version: channel.settings.version }, telegramCredentialConfigured: Boolean(channel.credential), createdAt: channel.createdAt.toISOString(), updatedAt: channel.updatedAt.toISOString() };
  }
}
