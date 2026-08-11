import { Injectable } from '@nestjs/common';
import { MemoryService } from '../../memory/application/memory.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { canonicalizeText, contentHash, extractEntities, extractTopics, truncateOnWord } from '@atmp/shared';
import { idempotencyKeys, MEMORY_CONFIG_VERSION } from '@atmp/contracts';
import { QueueRegistry } from '../../../infrastructure/queue/queue.registry';

export interface DiscoverResult {
  sourceItemId: string;
  ideaId: string;
  decision: 'NEW' | 'RELATED' | 'UPDATE' | 'DUPLICATE';
  jobId: string | null;
}

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: MemoryService,
    private readonly queue: QueueRegistry,
  ) {}

  /**
   * Creates exactly one idea per channel/source item. Replaying a discovery
   * batch updates that row instead of creating a second candidate.
   */
  async discover(channelId: string, sourceId: string, sourceItemIds: readonly string[] = []): Promise<DiscoverResult[]> {
    const bindings = await this.prisma.channelSource.findMany({
      where: { channelId, sourceId, enabled: true },
      select: { sourceId: true },
    });
    if (bindings.length === 0) return [];

    const items = await this.prisma.sourceItem.findMany({
      where: { sourceId, ...(sourceItemIds.length > 0 ? { id: { in: [...sourceItemIds] } } : {}) },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const results: DiscoverResult[] = [];
    for (const item of items) {
      const combined = `${item.title}. ${item.normalizedText}`;
      const normalizedText = canonicalizeText(combined).slice(0, 20_000);
      const entities = extractEntities(`${item.title}. ${item.text}`);
      const topics = extractTopics(combined);
      const hash = contentHash(combined);
      const summary = truncateOnWord(item.normalizedText, 500);
      const idea = await this.prisma.contentIdea.upsert({
        where: { channelId_sourceItemId: { channelId, sourceItemId: item.id } },
        create: {
          channelId,
          sourceItemId: item.id,
          title: item.title,
          summary,
          normalizedText,
          contentHash: hash,
          canonicalUrl: item.canonicalUrl,
          entities,
          topics,
          rank: rankItem(item.publishedAt, item.createdAt),
          status: 'CANDIDATE',
        },
        update: {
          title: item.title,
          summary,
          normalizedText,
          contentHash: hash,
          canonicalUrl: item.canonicalUrl,
          entities,
          topics,
          rank: rankItem(item.publishedAt, item.createdAt),
        },
        select: { id: true },
      });

      const classification = await this.memory.classify({
        channelId,
        kind: 'IDEA',
        refId: idea.id,
        title: item.title,
        text: item.normalizedText,
        canonicalUrl: item.canonicalUrl,
        entities,
        topics,
      }, { configVersion: MEMORY_CONFIG_VERSION });
      await this.prisma.contentIdea.update({
        where: { id: idea.id },
        data: {
          decision: classification.decision,
          decisionMethod: classification.method,
          decisionConfidence: classification.confidence,
          decisionExplanation: classification.explanation,
          classifiedAt: new Date(),
          status: classification.decision === 'DUPLICATE' ? 'REJECTED' : 'CANDIDATE',
          rejectionReason: classification.decision === 'DUPLICATE' ? classification.explanation : null,
        },
      });
      await this.memory.recordDecision({ channelId, ideaId: idea.id, classification });
      if (classification.decision !== 'DUPLICATE') await this.memory.index({
        channelId,
        kind: 'IDEA',
        refId: idea.id,
        title: item.title,
        text: item.normalizedText,
        canonicalUrl: item.canonicalUrl,
        entities,
        topics,
      });

      results.push({ sourceItemId: item.id, ideaId: idea.id, decision: classification.decision, jobId: null });
    }
    return results;
  }

  /** Enqueues one deterministic discovery run for an ingestion handoff. */
  async enqueue(channelId: string, sourceId: string, sourceItemIds: readonly string[] = []): Promise<string | null> {
    const batchKey = sourceItemIds.length > 0 ? [...sourceItemIds].sort().join(',') : 'backlog';
    return this.queue.enqueue(
      'content-intelligence',
      'content.discover-ideas',
      { correlationId: crypto.randomUUID(), enqueuedAt: new Date().toISOString(), enqueuedBy: 'worker', attemptHint: 0, channelId, sourceId, sourceItemIds },
      idempotencyKeys.discovery(channelId, sourceId, batchKey),
    );
  }
}

function rankItem(publishedAt: Date | null, createdAt: Date): number {
  const timestamp = publishedAt?.getTime() ?? createdAt.getTime();
  return Math.max(0, Math.min(100, Math.floor(timestamp / 86_400_000) % 101));
}
