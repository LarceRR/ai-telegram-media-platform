import { Injectable } from '@nestjs/common';
import { evaluateQualityGate, qualityGateInputSchema, type QualityGateInput } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class QualityGateService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(postId: string, actorId: string, input: QualityGateInput) {
    const value = qualityGateInputSchema.parse(input);
    const decision = evaluateQualityGate(value);
    const rows = await this.prisma.$queryRawUnsafe<Array<{ channelId: string }>>(`SELECT p.channel_id AS "channelId" FROM posts p WHERE p.id = $1 AND EXISTS (SELECT 1 FROM channel_members cm JOIN users u ON u.id = cm.user_id WHERE cm.channel_id = p.channel_id AND (u.id::text = $2 OR u.email = $2))`, postId, actorId);
    const row = rows[0];
    if (!row) throw new AppError('FORBIDDEN', 'Post access denied');
    await this.prisma.$transaction(async (tx) => {
      if (decision === 'REVIEW' || (decision === 'WAIT' && value.mode === 'AUTO')) {
        await tx.$executeRawUnsafe(`INSERT INTO moderation_queue (post_id, channel_id, status, reason) VALUES ($1, $2, 'PENDING', $3) ON CONFLICT (post_id) DO UPDATE SET status = 'PENDING', reason = EXCLUDED.reason`, postId, row.channelId, `QUALITY_GATE_${decision}`);
      }
      await tx.auditLog.create({ data: { actorType: 'SYSTEM', actorId, action: 'QUALITY_GATE_EVALUATED', entityType: 'Post', entityId: postId, metadata: { decision, mode: value.mode, hasUnverifiedClaims: value.hasUnverifiedClaims } } });
    });
    return { postId, decision, routedToModeration: decision === 'REVIEW' || (decision === 'WAIT' && value.mode === 'AUTO') };
  }
}
