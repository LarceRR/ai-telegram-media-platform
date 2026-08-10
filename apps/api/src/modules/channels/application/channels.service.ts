import { Injectable } from '@nestjs/common';
import { ChannelMemberRole } from '@atmp/database';
import type { ChannelResponse } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditLogService } from '../../system/application/audit-log.service';
import type { AddMemberDto, CreateChannelDto, UpdateChannelDto, UpdateSettingsDto, UpsertCredentialReferenceDto } from '../presentation/dto/channel.dto';

const PROTECTED_FIELDS = new Set(['minEvidence', 'forbiddenTopics', 'legalRestrictions', 'blacklist', 'researchMaxLevel']);
const OPTIMIZABLE_FIELDS = new Set(['minInterest', 'minQuality', 'minOriginality', 'hookStyle', 'maxLength', 'emojiPolicy']);

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async create(actorExternalId: string, actorName: string, dto: CreateChannelDto): Promise<ChannelResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { externalId: actorExternalId }, update: { displayName: actorName }, create: { externalId: actorExternalId, displayName: actorName } });
      const channel = await tx.channel.create({ data: { telegramChatId: dto.telegramChatId, title: dto.title, username: dto.username, language: dto.language ?? 'en', mode: dto.mode ?? 'MODERATED', members: { create: { userId: user.id, role: ChannelMemberRole.OWNER } }, settings: { create: {} } }, include: { settings: true, members: { where: { userId: user.id }, select: { role: true } }, credentials: { where: { active: true }, select: { id: true } } } });
      return this.toResponse(channel, channel.members[0]?.role ?? ChannelMemberRole.OWNER);
    });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorExternalId, action: 'channel.created', entityType: 'Channel', entityId: result.id, metadata: { mode: result.mode } });
    return result;
  }

  async list(actorExternalId: string): Promise<ChannelResponse[]> {
    const user = await this.prisma.user.findUnique({ where: { externalId: actorExternalId } });
    if (!user) return [];
    const channels = await this.prisma.channel.findMany({ where: { members: { some: { userId: user.id } } }, orderBy: { createdAt: 'desc' }, include: { settings: true, members: { where: { userId: user.id }, select: { role: true } }, credentials: { where: { active: true }, select: { id: true } } } });
    return channels.map((channel) => this.toResponse(channel, channel.members[0]?.role ?? ChannelMemberRole.VIEWER));
  }

  async get(actorExternalId: string, id: string): Promise<ChannelResponse> {
    const channel = await this.authorizedChannel(actorExternalId, id, ChannelMemberRole.VIEWER);
    return this.toResponse(channel, channel.members[0]?.role ?? ChannelMemberRole.VIEWER);
  }

  async update(actorExternalId: string, id: string, dto: UpdateChannelDto): Promise<ChannelResponse> {
    const current = await this.authorizedChannel(actorExternalId, id, ChannelMemberRole.EDITOR);
    const updated = await this.prisma.channel.update({ where: { id }, data: dto, include: { settings: true, members: { where: { user: { externalId: actorExternalId } }, select: { role: true } }, credentials: { where: { active: true }, select: { id: true } } } });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorExternalId, action: 'channel.updated', entityType: 'Channel', entityId: id, metadata: { fields: Object.keys(dto) } });
    return this.toResponse(updated, current.members[0]?.role ?? ChannelMemberRole.EDITOR);
  }

  async updateSettings(actorExternalId: string, id: string, dto: UpdateSettingsDto): Promise<ChannelResponse> {
    const current = await this.authorizedChannel(actorExternalId, id, ChannelMemberRole.EDITOR);
    const role = current.members[0]?.role ?? ChannelMemberRole.VIEWER;
    const changed = Object.keys(dto).filter((key) => key !== 'expectedVersion');
    if (role !== ChannelMemberRole.OWNER && changed.some((key) => PROTECTED_FIELDS.has(key))) throw new AppError('FORBIDDEN', 'Only channel owners can change protected settings');
    if (changed.some((key) => !PROTECTED_FIELDS.has(key) && !OPTIMIZABLE_FIELDS.has(key))) throw new AppError('VALIDATION', 'Unknown settings field');
    const { expectedVersion: _expectedVersion, ...settingsData } = dto;
    const settings = await this.prisma.channelSettings.updateMany({ where: { channelId: id, version: dto.expectedVersion }, data: { ...settingsData, version: { increment: 1 } } });
    if (settings.count !== 1) throw new AppError('CONFLICT', 'Settings version is stale; reload before updating');
    const updated = await this.prisma.channel.findUniqueOrThrow({ where: { id }, include: { settings: true, members: { where: { user: { externalId: actorExternalId } }, select: { role: true } }, credentials: { where: { active: true }, select: { id: true } } } });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorExternalId, action: 'channel.settings.updated', entityType: 'ChannelSettings', entityId: id, metadata: { fields: changed, version: dto.expectedVersion + 1 } });
    return this.toResponse(updated, role);
  }

  async addMember(actorExternalId: string, id: string, dto: AddMemberDto): Promise<void> {
    const channel = await this.authorizedChannel(actorExternalId, id, ChannelMemberRole.OWNER);
    const user = await this.prisma.user.upsert({ where: { externalId: dto.externalId }, update: { displayName: dto.displayName }, create: { externalId: dto.externalId, displayName: dto.displayName } });
    await this.prisma.channelMember.upsert({ where: { channelId_userId: { channelId: id, userId: user.id } }, update: { role: dto.role }, create: { channelId: id, userId: user.id, role: dto.role } });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorExternalId, action: 'channel.member.upserted', entityType: 'ChannelMember', entityId: channel.id, metadata: { memberExternalId: dto.externalId, role: dto.role } });
  }

  async upsertCredential(actorExternalId: string, id: string, dto: UpsertCredentialReferenceDto): Promise<void> {
    await this.authorizedChannel(actorExternalId, id, ChannelMemberRole.OWNER);
    if (/token|secret|password|api[_-]?key|bot\d*:/i.test(dto.reference)) throw new AppError('VALIDATION', 'Store a secret-manager reference, never a credential value');
    await this.prisma.credentialReference.upsert({ where: { channelId_provider: { channelId: id, provider: dto.provider } }, update: { reference: dto.reference, active: true }, create: { channelId: id, provider: dto.provider, reference: dto.reference } });
    await this.audit.record({ actorType: 'HUMAN', actorId: actorExternalId, action: 'channel.credential_reference.updated', entityType: 'CredentialReference', entityId: id, metadata: { provider: dto.provider } });
  }

  private async authorizedChannel(actorExternalId: string, id: string, minimum: ChannelMemberRole) {
    const channel = await this.prisma.channel.findFirst({ where: { id, members: { some: { user: { externalId: actorExternalId } } } }, include: { settings: true, members: { where: { user: { externalId: actorExternalId } }, select: { role: true } }, credentials: { where: { active: true }, select: { id: true } } } });
    if (!channel) throw new AppError('NOT_FOUND', 'Channel not found');
    const role = channel.members[0]?.role;
    const rank = { VIEWER: 0, EDITOR: 1, OWNER: 2 } as const;
    if (!role || rank[role] < rank[minimum]) throw new AppError('FORBIDDEN', 'Insufficient channel permissions');
    return channel;
  }

  private toResponse(channel: any, role: ChannelMemberRole): ChannelResponse {
    if (!channel.settings) throw new AppError('INTERNAL', 'Channel settings are missing');
    return { id: channel.id, telegramChatId: channel.telegramChatId, title: channel.title, username: channel.username, language: channel.language, mode: channel.mode, active: channel.active, role, settings: { minInterest: channel.settings.minInterest, minQuality: channel.settings.minQuality, minEvidence: channel.settings.minEvidence, minOriginality: channel.settings.minOriginality, researchMaxLevel: channel.settings.researchMaxLevel, forbiddenTopics: channel.settings.forbiddenTopics as string[], legalRestrictions: channel.settings.legalRestrictions as string[], blacklist: channel.settings.blacklist as string[], hookStyle: channel.settings.hookStyle, maxLength: channel.settings.maxLength, emojiPolicy: channel.settings.emojiPolicy, version: channel.settings.version }, telegramCredentialConfigured: channel.credentials.length > 0, createdAt: channel.createdAt.toISOString(), updatedAt: channel.updatedAt.toISOString() };
  }
}
