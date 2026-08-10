import { Injectable } from '@nestjs/common';
import { Prisma, ChannelMemberRole, ChannelStatus, CredentialProvider, UserStatus } from '@atmp/database';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AppError } from '@atmp/shared';
import type { AddMemberDto, CreateChannelDto, CredentialRefDto, UpdateChannelDto, UpdateSettingsDto } from '../presentation/dto/channel.dto';

const roleRank: Record<ChannelMemberRole, number> = { OWNER: 4, EDITOR: 3, OPERATOR: 2, VIEWER: 1 };

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(actorId: string, dto: CreateChannelDto) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor || actor.status !== UserStatus.ACTIVE) throw new AppError('UNAUTHORIZED', 'Active actor required');
    return this.prisma.$transaction(async (tx) => {
      const channel = await tx.channel.create({ data: { telegramId: dto.telegramId, username: dto.username, title: dto.title, language: dto.language ?? 'en', createdById: actorId, settings: { create: {} }, members: { create: { userId: actorId, role: ChannelMemberRole.OWNER } } }, include: { settings: true, members: { include: { user: { select: { id: true, email: true, displayName: true } } } } } });
      await tx.auditLog.create({ data: { actorType: 'HUMAN', actorId, action: 'channel.created', entityType: 'Channel', entityId: channel.id, metadata: { telegramId: dto.telegramId } } });
      return channel;
    });
  }
  async list(actorId: string) { await this.requireUser(actorId); return this.prisma.channel.findMany({ where: { members: { some: { userId: actorId } }, status: { not: ChannelStatus.ARCHIVED } }, include: { settings: true, members: { where: { userId: actorId }, select: { role: true } } }, orderBy: { createdAt: 'desc' } }); }
  async get(actorId: string, channelId: string) { await this.requireRole(actorId, channelId, ChannelMemberRole.VIEWER); return this.prisma.channel.findUniqueOrThrow({ where: { id: channelId }, include: { settings: true, members: { include: { user: { select: { id: true, email: true, displayName: true, status: true } } } }, credential: { select: { id: true, provider: true, secretRef: true, updatedAt: true } } } }); }
  async update(actorId: string, channelId: string, dto: UpdateChannelDto) { await this.requireRole(actorId, channelId, ChannelMemberRole.EDITOR); const channel = await this.prisma.channel.update({ where: { id: channelId }, data: dto as Prisma.ChannelUpdateInput }); await this.audit(actorId, 'channel.updated', 'Channel', channelId, dto as unknown as Prisma.InputJsonValue); return channel; }
  async updateSettings(actorId: string, channelId: string, dto: UpdateSettingsDto) {
    await this.requireRole(actorId, channelId, ChannelMemberRole.OWNER);
    const current = await this.prisma.channelSettings.findUnique({ where: { channelId } });
    if (!current) throw new AppError('NOT_FOUND', 'Channel settings not found');
    if (current.version !== dto.expectedVersion) throw new AppError('CONFLICT', 'Settings version is stale', { expectedVersion: current.version });
    const { expectedVersion: _expectedVersion, ...changes } = dto;
    if (changes.minLength !== undefined && changes.maxLength !== undefined && changes.minLength > changes.maxLength) throw new AppError('VALIDATION', 'minLength cannot exceed maxLength');
    const updated = await this.prisma.channelSettings.update({ where: { channelId }, data: { ...changes, version: { increment: 1 }, forbiddenTopics: changes.forbiddenTopics as Prisma.InputJsonValue, legalRestrictions: changes.legalRestrictions as Prisma.InputJsonValue, sourcePriorities: changes.sourcePriorities as Prisma.InputJsonValue, styleConfig: changes.styleConfig as Prisma.InputJsonValue } });
    await this.audit(actorId, 'channel.settings.updated', 'ChannelSettings', updated.id, { expectedVersion: dto.expectedVersion, newVersion: updated.version });
    return updated;
  }
  async addMember(actorId: string, channelId: string, dto: AddMemberDto) { await this.requireRole(actorId, channelId, ChannelMemberRole.OWNER); const user = await this.prisma.user.findUnique({ where: { id: dto.userId } }); if (!user || user.status !== UserStatus.ACTIVE) throw new AppError('NOT_FOUND', 'Active user not found'); const member = await this.prisma.channelMember.upsert({ where: { channelId_userId: { channelId, userId: dto.userId } }, create: { channelId, userId: dto.userId, role: dto.role }, update: { role: dto.role }, include: { user: { select: { id: true, email: true, displayName: true } } } }); await this.audit(actorId, 'channel.member.upserted', 'ChannelMember', member.id, { userId: dto.userId, role: dto.role }); return member; }
  async setCredential(actorId: string, channelId: string, dto: CredentialRefDto) { await this.requireRole(actorId, channelId, ChannelMemberRole.OWNER); const ref = await this.prisma.sourceCredentialRef.upsert({ where: { channelId }, create: { channelId, provider: CredentialProvider.TELEGRAM_BOT, secretRef: dto.secretRef, createdById: actorId }, update: { secretRef: dto.secretRef } }); await this.audit(actorId, 'channel.credential_ref.updated', 'SourceCredentialRef', ref.id, { provider: ref.provider }); return { id: ref.id, provider: ref.provider, secretRef: ref.secretRef, updatedAt: ref.updatedAt }; }
  private async requireUser(actorId: string) { const user = await this.prisma.user.findUnique({ where: { id: actorId } }); if (!user || user.status !== UserStatus.ACTIVE) throw new AppError('UNAUTHORIZED', 'Active actor required'); return user; }
  private async requireRole(actorId: string, channelId: string, minimum: ChannelMemberRole) { await this.requireUser(actorId); const member = await this.prisma.channelMember.findUnique({ where: { channelId_userId: { channelId, userId: actorId } } }); if (!member || roleRank[member.role] < roleRank[minimum]) throw new AppError('FORBIDDEN', 'Insufficient channel role'); return member; }
  private async audit(actorId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonValue) { await this.prisma.auditLog.create({ data: { actorType: 'HUMAN', actorId, action, entityType, entityId, metadata } }); }
}
