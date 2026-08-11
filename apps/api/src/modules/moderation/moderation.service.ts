import { Injectable } from '@nestjs/common';
import { moderationActionSchema } from '@atmp/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async queue(channelId: string) {
    return this.prisma.$queryRawUnsafe(`SELECT * FROM moderation_queue WHERE channel_id = $1 AND status = 'PENDING' ORDER BY created_at ASC LIMIT 100`, channelId);
  }

  async act(postId: string, channelId: string, actorId: string, input: unknown) {
    const action = moderationActionSchema.parse(input);
    const status = action.action === 'APPROVE' ? 'APPROVED' : action.action === 'REJECT' ? 'REJECTED' : 'REGENERATION_REQUESTED';
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`UPDATE moderation_queue SET status = $1, reason = $2, acted_by = $3, acted_at = CURRENT_TIMESTAMP WHERE post_id = $4 AND channel_id = $5 AND status = 'PENDING'`, status, action.reason, actorId, postId, channelId);
      await tx.auditLog.create({ data: { actorType: 'HUMAN', actorId, action: `MODERATION_${action.action}`, entityType: 'Post', entityId: postId, metadata: { channelId, reason: action.reason } } });
    });
    return { postId, status, reason: action.reason };
  }
}
