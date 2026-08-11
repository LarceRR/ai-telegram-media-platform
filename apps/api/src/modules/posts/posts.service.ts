import { Injectable } from '@nestjs/common';
import { AppError } from '@atmp/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(postId: string, actorId: string) {
    const post = await this.prisma.$queryRawUnsafe<any[]>(`SELECT p.*, v.id AS version_id, v.version_number, v.body, v.source AS version_source, v.created_at AS version_created_at FROM posts p LEFT JOIN post_versions v ON v.post_id = p.id WHERE p.id = $1 AND EXISTS (SELECT 1 FROM channel_members cm JOIN users u ON u.id = cm.user_id WHERE cm.channel_id = p.channel_id AND (u.id::text = $2 OR u.email = $2)) ORDER BY v.version_number DESC`, postId, actorId);
    if (!post.length) throw new AppError('NOT_FOUND', 'Post not found');
    const claims = await this.prisma.$queryRawUnsafe<any[]>(`SELECT c.*, e.id AS evidence_id, e.url AS evidence_url, e.status AS evidence_status FROM claims c LEFT JOIN evidence e ON e.claim_id = c.id WHERE c.post_version_id = $1 ORDER BY c.created_at ASC`, post[0].version_id);
    return { post: post[0], versions: post, claims };
  }

  async edit(postId: string, actorId: string, body: string, source = 'HUMAN') {
    if (!body.trim() || body.length > 10000) throw new AppError('VALIDATION', 'Post body must contain 1-10000 characters');
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.$queryRawUnsafe<Array<{ channelId: string; currentVersion: number }>>(`SELECT p.channel_id AS "channelId", p.current_version AS "currentVersion" FROM posts p WHERE p.id = $1 AND EXISTS (SELECT 1 FROM channel_members cm JOIN users u ON u.id = cm.user_id WHERE cm.channel_id = p.channel_id AND (u.id::text = $2 OR u.email = $2)) FOR UPDATE`, postId, actorId);
      if (!current[0]) throw new AppError('NOT_FOUND', 'Post not found or access denied');
      const next = current[0].currentVersion + 1;
      await tx.$executeRawUnsafe(`INSERT INTO post_versions (post_id, version_number, body, source, created_by) VALUES ($1, $2, $3, $4, $5)`, postId, next, body, source, actorId);
      await tx.$executeRawUnsafe(`UPDATE posts SET current_version = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, next, postId);
      await tx.$executeRawUnsafe(`UPDATE post_scores SET invalidated_at = CURRENT_TIMESTAMP WHERE post_id = $1 AND invalidated_at IS NULL`, postId);
      await tx.auditLog.create({ data: { actorType: 'HUMAN', actorId, action: 'POST_VERSION_CREATED', entityType: 'Post', entityId: postId, metadata: { version: next, source } } });
      return { postId, version: next, body, scoresInvalidated: true };
    });
  }
}
