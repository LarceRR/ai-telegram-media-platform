import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

export type Decision = 'PUBLISH' | 'REVIEW' | 'DUPLICATE';
export interface SourceItem { id: string; url: string; title: string; body: string; publishedAt: string; imageUrl?: string; }
export interface Claim { text: string; supported: boolean; }
export interface Post { id: string; sourceItemId: string; text: string; claims: Claim[]; score: number; gate: 'PUBLISH' | 'REVIEW'; status: 'READY_FOR_REVIEW' | 'PUBLISHED'; provenance: Record<string, string>; }

@Injectable()
export class PipelineService {
  private readonly seenHashes = new Set<string>();
  private readonly posts = new Map<string, Post>();
  private readonly published = new Set<string>();

  process(item: SourceItem) {
    const fingerprint = this.fingerprint(item);
    if (this.seenHashes.has(fingerprint)) return { decision: 'DUPLICATE' as const, duplicate: true, postId: null };
    this.seenHashes.add(fingerprint);
    const claims = this.extractClaims(item.body);
    const score = Math.min(10, 5 + Math.min(item.body.length / 500, 3) + (claims.length ? 1 : 0));
    const gate: 'PUBLISH' | 'REVIEW' = claims.length ? 'REVIEW' : score >= 7 ? 'PUBLISH' : 'REVIEW';
    const post: Post = { id: randomUUID(), sourceItemId: item.id, text: `${item.title}\n\n${item.body.trim()}`, claims, score: Math.round(score * 100) / 100, gate, status: 'READY_FOR_REVIEW', provenance: { sourceUrl: item.url, provider: 'fake', pipelineVersion: '0.1.0' } };
    this.posts.set(post.id, post);
    return { decision: gate, duplicate: false, postId: post.id };
  }

  moderationQueue() { return [...this.posts.values()].filter((post) => post.status === 'READY_FOR_REVIEW'); }

  publish(postId: string) {
    const post = this.posts.get(postId);
    if (!post) throw new NotFoundException('post not found');
    this.published.add(postId);
    post.status = 'PUBLISHED';
    return { postId, status: post.status, idempotencyKey: `channel:default:post:${postId}:v1` };
  }

  private fingerprint(item: SourceItem) { return createHash('sha256').update(`${item.url} ${item.title} ${item.body}`.toLowerCase().replace(/\\s+/g, ' ').trim()).digest('hex'); }
  private extractClaims(body: string): Claim[] { return body.replace(/!/g, '.').split('.').map((text) => text.trim()).filter((text) => text && /\\d/.test(text)).slice(0, 5).map((text) => ({ text, supported: false })); }
}
