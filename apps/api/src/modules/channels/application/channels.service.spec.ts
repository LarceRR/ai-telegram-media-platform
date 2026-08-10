import { ChannelMemberRole } from '@atmp/database';
import { ChannelsService } from './channels.service';

describe('ChannelsService policy', () => {
  it('rejects stale settings versions before writing', async () => {
    const prisma = {
      channelSettings: { findUnique: jest.fn().mockResolvedValue({ id: 's1', channelId: 'c1', version: 3 }) },
    } as any;
    const service = new ChannelsService(prisma, {} as any);
    (service as any).requireRole = jest.fn().mockResolvedValue({ role: ChannelMemberRole.OWNER });
    await expect(service.updateSettings('u1', 'c1', { expectedVersion: 2 } as any)).rejects.toMatchObject({ category: 'CONFLICT' });
    expect(prisma.channelSettings.update).toBeUndefined();
  });

  it('rejects a non-member before checking the requested role', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', status: 'ACTIVE' }) }, channelMember: { findUnique: jest.fn().mockResolvedValue(null) } } as any;
    const service = new ChannelsService(prisma, {} as any);
    await expect((service as any).requireRole('u1', 'c1', ChannelMemberRole.EDITOR)).rejects.toMatchObject({ category: 'FORBIDDEN' });
  });
});
