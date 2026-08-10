import { Injectable } from '@nestjs/common';
import { ChannelMemberRole, Prisma } from '@atmp/database';
import type { ChannelResponse } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditLogService } from '../../system/application/audit-log.service';
import type { AddMemberDto, CreateChannelDto, CredentialRefDto, UpdateChannelDto, UpdateSettingsDto } from '../presentation/dto/channel.dto';

const PROTECTED = new Set(['mode', 'minEvidence', 'researchMaxLevel', 'forbiddenTopics', 'legalRestrictions']);
const EDITABLE = new Set(['timezone', 'minInterest', 'minQuality', 'minOriginality', 'minLength', 'maxLength', 'emojiEnabled', 'sourcePriorities', 'styleConfig']);

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async create(actorEmail: string, actorName: string, dto: CreateChannelDto): Promise<ChannelResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email: actorEmail }, update: { displayName: actorName }, create: { email: actorEmail, displayName: actorName } });
      const channel = await tx.channel.create({ data: { telegramId: dto.telegramId, username: dto.username, title: dto.title, language: dto.language ?? 'en', createdById: user.id, members: { create: { userId: user.id, role: ChannelMemberRole.OWNER } }, settings: { create: {} } }, include: this.includeFor(user.id) });
      return this.toResponse(channel, ChannelMemberRole.OWNER);
    });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorEmail, action: 'channel.created', entityType: 'Channel', entityId: result.id });
    return result;
  }

  async list(actorEmail: string): Promise<ChannelResponse[]> {
    const user = await this.prisma.user.findUnique({ where: { email: actorEmail } });
    if (!user) return [];
    const channels = await this.prisma.channel.findMany({ where: { members: { some: { userId: user.id } } }, orderBy: { createdAt: 'desc' }, include: this.includeFor(user.id) });
    return channels.map((channel) => this.toResponse(channel, channel.members[0]?.role ?? ChannelMemberRole.VIEWER));
  }

  async get(actorEmail: string, id: string): Promise<ChannelResponse> {
    const channel = await this.authorized(actorEmail, id, ChannelMemberRole.VIEWER);
    return this.toResponse(channel, channel.members[0]?.role ?? ChannelMemberRole.VIEWER);
  }

  async update(actorEmail: string, id: string, dto: UpdateChannelDto): Promise<ChannelResponse> {
    const current = await this.authorized(actorEmail, id, ChannelMemberRole.EDITOR);
    const data = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined));
    const updated = await this.prisma.channel.update({ where: { id }, data, include: this.includeFor(current.members[0]!.userId) });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorEmail, action: 'channel.updated', entityType: 'Channel', entityId: id, metadata: { fields: Object.keys(data) } });
    return this.toResponse(updated, current.members[0]!.role);
  }

  async updateSettings(actorEmail: string, id: string, dto: UpdateSettingsDto): Promise<ChannelResponse> {
    const current = await this.authorized(actorEmail, id, ChannelMemberRole.EDITOR);
    const role = current.members[0]!.role;
    const changed = Object.keys(dto).filter((key) => key !== 'expectedVersion');
    if (role !== ChannelMemberRole.OWNER && changed.some((key) => PROTECTED.has(key))) throw new AppError('FORBIDDEN', 'Only owners can change protected settings');
    if (changed.some((key) => !PROTECTED.has(key) && !EDITABLE.has(key))) throw new AppError('VALIDATION', 'Unknown settings field');
    const { expectedVersion: _expectedVersion, ...raw } = dto;
    const data: Prisma.ChannelSettingsUpdateManyMutationInput = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined));
    const result = await this.prisma.channelSettings.updateMany({ where: { channelId: id, version: dto.expectedVersion }, data: { ...data, version: { increment: 1 } } });
    if (result.count !== 1) throw new AppError('CONFLICT', 'Settings version is stale');
    const updated = await this.prisma.channel.findUniqueOrThrow({ where: { id }, include: this.includeFor(current.members[0]!.userId) });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorEmail, action: 'channel.settings.updated', entityType: 'ChannelSettings', entityId: id, metadata: { fields: changed, version: dto.expectedVersion + 1 } });
    return this.toResponse(updated, role);
  }

  async addMember(actorEmail: string, id: string, dto: AddMemberDto): Promise<void> {
    const channel = await this.authorized(actorEmail, id, ChannelMemberRole.OWNER);
    await this.prisma.channelMember.upsert({ where: { channelId_userId: { channelId: id, userId: dto.userId } }, update: { role: dto.role }, create: { channelId: id, userId: dto.userId, role: dto.role } });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorEmail, action: 'channel.member.upserted', entityType: 'ChannelMember', entityId: channel.id });
  }

  async setCredential(actorEmail: string, id: string, dto: CredentialRefDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: actorEmail } });
    await this.authorized(actorEmail, id, ChannelMemberRole.OWNER);
    if (!user || /token|password|secret|api[_-]?key|bot\d*:/i.test(dto.secretRef)) throw new AppError('VALIDATION', 'Use a secret-manager reference, never a credential value');
    await this.prisma.sourceCredentialRef.upsert({ where: { channelId: id }, update: { secretRef: dto.secretRef, createdById: user.id }, create: { channelId: id, provider: 'TELEGRAM_BOT', secretRef: dto.secretRef, createdById: user.id } });
  }

  private includeFor(userId: string) { return { settings: true, members: { where: { userId }, select: { role: true, userId: true } }, credential: { select: { id: true } } } as const; }
  private async authorized(email: string, id: string, minimum: ChannelMemberRole) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const channel = user ? await this.prisma.channel.findFirst({ where: { id, members: { some: { userId: user.id } } }, include: this.includeFor(user.id) }) : null;
    if (!channel) throw new AppError('NOT_FOUND', 'Channel not found');
    const role = channel.members[0]?.role;
    const rank = { VIEWER: 0, OPERATOR: 1, EDITOR: 2, OWNER: 3 } as const;
    if (!role || rank[role] < rank[minimum]) throw new AppError('FORBIDDEN', 'Insufficient channel permissions');
    return channel;
  }
  private toResponse(channel: any, role: ChannelMemberRole): ChannelResponse {
    const settings = channel.settings;
    if (!settings) throw new AppError('INTERNAL', 'Channel settings are missing');
    return { id: channel.id, telegramId: channel.telegramId, title: channel.title, username: channel.username, language: channel.language, status: channel.status, role, settings: { mode: settings.mode, timezone: settings.timezone, minInterest: settings.minInterest, minQuality: settings.minQuality, minEvidence: settings.minEvidence, minOriginality: settings.minOriginality, researchMaxLevel: settings.researchMaxLevel, minLength: settings.minLength, maxLength: settings.maxLength, emojiEnabled: settings.emojiEnabled, forbiddenTopics: settings.forbiddenTopics as string[], legalRestrictions: settings.legalRestrictions as string[], sourcePriorities: settings.sourcePriorities as Record<string, number>, styleConfig: settings.styleConfig as Record<string, unknown>, version: settings.version }, telegramCredentialConfigured: Boolean(channel.credential), createdAt: channel.createdAt.toISOString(), updatedAt: channel.updatedAt.toISOString() };
  }
}
