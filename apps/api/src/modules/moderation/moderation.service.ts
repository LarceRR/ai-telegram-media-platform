import { Injectable } from '@nestjs/common';
import { moderationActionSchema } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async queue(channelId: string, actorId: string) {
    await this.assertMember(channelId, actorId);
    return this.prisma.$queryRawUnsafe(
      `SELECT id, post_id AS "postId", channel_id AS "channelId", status, reason, created_at AS "createdAt" FROM moderation_queue WHERE channel_id = $1 AND status = 'PENDING' ORDER BY created_at ASC LIMIT 100`,
      channelId,
    );
  }

  async act(postId: string, channelId: string, actorId: string, input: unknown) {
    await this.assertMember(channelId, actorId);
    const action = moderationActionSchema.parse(input);
    const status = action.action === 'APPROVE' ? 'APPROVED' : action.action === 'REJECT' ? 'REJECTED' : 'REGENERATION_REQUESTED';
    const changed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE moderation_queue SET status = $1, reason = $2, acted_by = $3, acted_at = CURRENT_TIMESTAMP WHERE post_id = $4 AND channel_id = $5 AND status = 'PENDING' RETURNING id`,
        status, action.reason, actorId, postId, channelId,
      );
      if (rows.length !== 1) throw new AppError('NOT_FOUND', 'Moderation item is missing or already acted on');
      await tx.auditLog.create({ data: { actorType: 'HUMAN', actorId, action: `MODERATION_${action.action}`, entityType: 'Post', entityId: postId, metadata: { channelId, reason: action.reason, status } } });
      return rows[0];
    });
    return { id: changed.id, postId, status, reason: action.reason };
  }

  private async assertMember(channelId: string, actorId: string): Promise<void> {
    const member = await this.prisma.channelMember.findFirst({ where: { channelId, user: { OR: [{ id: actorId }, { email: actorId }] } }, select: { id: true } });
    if (!member) throw new AppError('FORBIDDEN', 'Channel access denied');
  }
}
