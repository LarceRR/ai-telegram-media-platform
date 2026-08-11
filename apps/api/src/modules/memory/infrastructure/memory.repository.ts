import { Injectable } from '@nestjs/common';
import type { MemoryItemKind, MemoryItemState } from '@atmp/contracts';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { MemoryNeighbour } from '../domain/memory-classifier';

/**
 * The only place that touches the pgvector column.
 *
 * Prisma cannot type `vector(1536)`, so the embedding is written and searched
 * through reviewed raw SQL while everything else stays on the typed client.
 * Ranking stays in SQL as well: pulling rows into Node to sort them would
 * bypass the HNSW index and turn every duplicate check into a full scan.
 */

export interface UpsertMemoryItemInput {
  channelId: string;
  kind: MemoryItemKind;
  state: MemoryItemState;
  refId: string;
  title: string;
  normalizedText: string;
  contentHash: string;
  canonicalUrl: string | null;
  entities: string[];
  topics: string[];
  embeddingModel: string;
  embeddingDim: number;
  embedding: readonly number[];
}

export interface NeighbourQuery {
  channelId: string;
  embedding: readonly number[];
  limit: number;
  excludeRefId?: string | null;
}

interface NeighbourRow {
  memory_item_id: string;
  kind: string;
  ref_id: string;
  title: string;
  content_hash: string;
  canonical_url: string | null;
  entities: string[];
  topics: string[];
  distance: number;
}

/** No row can carry this id, so it is a safe "exclude nothing" sentinel. */
const NO_EXCLUSION = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class MemoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert keyed by `(channelId, kind, refId)`, so re-indexing an item refreshes
   * it instead of creating a second competing memory of the same thing.
   */
  async upsert(input: UpsertMemoryItemInput): Promise<string> {
    const row = await this.prisma.memoryItem.upsert({
      where: {
        channelId_kind_refId: {
          channelId: input.channelId,
          kind: input.kind,
          refId: input.refId,
        },
      },
      create: {
        channelId: input.channelId,
        kind: input.kind,
        state: input.state,
        refId: input.refId,
        title: input.title,
        normalizedText: input.normalizedText,
        contentHash: input.contentHash,
        canonicalUrl: input.canonicalUrl,
        entities: input.entities,
        topics: input.topics,
        embeddingModel: input.embeddingModel,
        embeddingDim: input.embeddingDim,
      },
      update: {
        state: input.state,
        title: input.title,
        normalizedText: input.normalizedText,
        contentHash: input.contentHash,
        canonicalUrl: input.canonicalUrl,
        entities: input.entities,
        topics: input.topics,
        embeddingModel: input.embeddingModel,
        embeddingDim: input.embeddingDim,
      },
      select: { id: true },
    });

    const literal = toVectorLiteral(input.embedding);
    await this.prisma.$executeRaw`UPDATE memory_items SET embedding = ${literal}::vector, updated_at = NOW() WHERE id = ${row.id}::uuid`;
    return row.id;
  }

  /** Ordered by cosine distance in SQL so the HNSW index does the work. */
  async nearest(query: NeighbourQuery): Promise<MemoryNeighbour[]> {
    const literal = toVectorLiteral(query.embedding);
    const exclude = query.excludeRefId ?? NO_EXCLUSION;
    const rows = await this.prisma.$queryRaw<NeighbourRow[]>`SELECT id AS memory_item_id, kind::text AS kind, ref_id, title, content_hash, canonical_url, entities, topics, (embedding <=> ${literal}::vector) AS distance FROM memory_items WHERE channel_id = ${query.channelId}::uuid AND state = 'ACTIVE' AND embedding IS NOT NULL AND ref_id <> ${exclude}::uuid ORDER BY embedding <=> ${literal}::vector LIMIT ${query.limit}`;
    return rows.map(toNeighbour);
  }

  /** Exact content identity. Cheaper and more certain than any vector scan. */
  async findByContentHash(
    channelId: string,
    hash: string,
    excludeRefId?: string | null,
  ): Promise<MemoryNeighbour | null> {
    const row = await this.prisma.memoryItem.findFirst({
      where: {
        channelId,
        contentHash: hash,
        state: 'ACTIVE',
        ...(excludeRefId ? { NOT: { refId: excludeRefId } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return row ? fromRecord(row) : null;
  }

  async findByCanonicalUrl(
    channelId: string,
    canonicalUrl: string,
    excludeRefId?: string | null,
  ): Promise<MemoryNeighbour | null> {
    const row = await this.prisma.memoryItem.findFirst({
      where: {
        channelId,
        canonicalUrl,
        state: 'ACTIVE',
        ...(excludeRefId ? { NOT: { refId: excludeRefId } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return row ? fromRecord(row) : null;
  }

  /**
   * Archiving keeps the row for provenance while removing it from duplicate
   * checks. Nothing in memory is ever deleted.
   */
  async archive(channelId: string, kind: MemoryItemKind, refId: string): Promise<void> {
    await this.prisma.memoryItem.updateMany({
      where: { channelId, kind, refId },
      data: { state: 'ARCHIVED', archivedAt: new Date() },
    });
  }
}

export function toVectorLiteral(values: readonly number[]): string {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(',')}]`;
}

function toNeighbour(row: NeighbourRow): MemoryNeighbour {
  return {
    memoryItemId: row.memory_item_id,
    kind: row.kind as MemoryItemKind,
    refId: row.ref_id,
    title: row.title,
    contentHash: row.content_hash,
    canonicalUrl: row.canonical_url,
    entities: row.entities,
    topics: row.topics,
    distance: Number(row.distance),
  };
}

function fromRecord(record: {
  id: string;
  kind: string;
  refId: string;
  title: string;
  contentHash: string;
  canonicalUrl: string | null;
  entities: string[];
  topics: string[];
}): MemoryNeighbour {
  return {
    memoryItemId: record.id,
    kind: record.kind as MemoryItemKind,
    refId: record.refId,
    title: record.title,
    contentHash: record.contentHash,
    canonicalUrl: record.canonicalUrl,
    entities: record.entities,
    topics: record.topics,
    // A rule match needs no distance; zero states "identical" explicitly.
    distance: 0,
  };
}
