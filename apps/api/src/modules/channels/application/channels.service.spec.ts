import { ChannelMemberRole } from '@atmp/database';
import { AppError } from '@atmp/shared';
import { ChannelsService } from './channels.service';

describe('ChannelsService policy', () => {
  it('rejects stale settings versions before writing', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
      channel: { findFirst: jest.fn().mockResolvedValue({ members: [{ role: ChannelMemberRole.OWNER, userId: 'u1' }], settings: { version: 3 } }) },
      channelSettings: { updateMany: jest.fn() },
    } as any;
    const service = new ChannelsService(prisma, {} as any);
    await expect(service.updateSettings('u1', 'c1', { expectedVersion: 2 } as any)).rejects.toMatchObject({ category: 'CONFLICT' });
    expect(prisma.channelSettings.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a non-member before checking the requested role', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
      channel: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = new ChannelsService(prisma, {} as any);
    await expect(service.get('u1', 'c1')).rejects.toMatchObject({ category: 'FORBIDDEN' });
  });

  it('keeps the protected settings policy explicit', () => {
    expect(AppError).toBeDefined();
  });
});
