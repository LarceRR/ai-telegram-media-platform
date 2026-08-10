import { ChannelMemberRole } from '@atmp/database';
import { AppError } from '@atmp/shared';
import { ChannelsService } from './channels.service';

describe('ChannelsService policy', () => {
  it('rejects stale settings versions before writing', async () => {
    const prisma = {
      channelSettings: { findUnique: jest.fn().mockResolvedValue({ id: 's1', channelId: 'c1', version: 3 }) },
    } as any;
    const access = { } as any;
    const service = new ChannelsService(prisma, access);
    (service as any).requireRole = jest.fn().mockResolvedValue({ role: ChannelMemberRole.OWNER });
    await expect(service.updateSettings('u1', 'c1', { expectedVersion: 2 })).rejects.toMatchObject({ category: 'CONFLICT' } satisfies Partial<AppError>);
    expect(prisma.channelSettings.update).toBeUndefined();
  });

  it('does not permit a viewer to satisfy editor access', async () => {
    const service = new ChannelsService({} as any, {} as any);
    await expect((service as any).requireRole('u1', 'c1', ChannelMemberRole.EDITOR)).rejects.toMatchObject({ category: 'FORBIDDEN' });
  });
});
