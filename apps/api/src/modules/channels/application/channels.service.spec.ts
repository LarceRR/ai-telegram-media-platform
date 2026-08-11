import { ChannelMemberRole } from '@atmp/database';
import { ChannelsService } from './channels.service';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { AuditLogService } from '../../system/application/audit-log.service';

const auditStub = {} as unknown as AuditLogService;

describe('ChannelsService policy', () => {
  it('increments settings version on a successful optimistic update', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
      channel: {
        findFirst: jest.fn().mockResolvedValue({
          members: [{ role: ChannelMemberRole.OWNER, userId: 'u1' }],
          settings: { version: 1 },
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'c1',
          telegramId: 'tg-1',
          title: 'Test',
          username: null,
          language: 'en',
          status: 'ACTIVE',
          members: [{ role: ChannelMemberRole.OWNER, userId: 'u1' }],
          credential: null,
          settings: {
            mode: 'AUTO',
            timezone: 'UTC',
            minInterest: 6,
            minQuality: 6,
            minEvidence: 7,
            minOriginality: 5,
            researchMaxLevel: 2,
            minLength: null,
            maxLength: 4000,
            emojiEnabled: false,
            forbiddenTopics: [],
            legalRestrictions: [],
            sourcePriorities: {},
            styleConfig: {},
            version: 2,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      channelSettings: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as PrismaService;
    const service = new ChannelsService(prisma, auditStub);
    const result = await service.updateSettings('u1', 'c1', {
      mode: 'AUTO',
      expectedVersion: 1,
    });
    expect(prisma.channelSettings.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channelId: 'c1', version: 1 },
        data: expect.objectContaining({ version: { increment: 1 } }),
      }),
    );
    expect(result.version).toBe(2);
  });

  it('rejects stale settings versions before returning a mutation response', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
      channel: {
        findFirst: jest.fn().mockResolvedValue({
          members: [{ role: ChannelMemberRole.OWNER, userId: 'u1' }],
          settings: { version: 3 },
        }),
      },
      channelSettings: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as PrismaService;
    const service = new ChannelsService(prisma, auditStub);
    await expect(service.updateSettings('u1', 'c1', { expectedVersion: 2 })).rejects.toMatchObject({
      category: 'CONFLICT',
    });
  });

  it('rejects a non-member before checking the requested role', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
      channel: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new ChannelsService(prisma, auditStub);
    await expect(service.get('u1', 'c1')).rejects.toMatchObject({ category: 'FORBIDDEN' });
  });
});
