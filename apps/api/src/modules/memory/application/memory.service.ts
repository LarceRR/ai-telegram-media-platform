import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_MEMORY_THRESHOLDS,
  MEMORY_CONFIG_VERSION,
  memoryClassificationSchema,
  type MemoryClassification,
  type MemoryItemKind,
  type MemoryItemState,
  type MemoryThresholds,
} from '@atmp/contracts';
import {
  AppError,
  canonicalizeText,
  contentHash,
  extractEntities,
  extractTopics,
} from '@atmp/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { EmbeddingProvider } from '../domain/embedding';
import {
  classifyCandidate,
  type ExactMatch,
  type MemoryNeighbour,
} from '../domain/memory-classifier';
import { MemoryRepository } from '../infrastructure/memory.repository';
import { EMBEDDING_PROVIDER } from '../infrastructure/memory.tokens';

/** How many neighbours the cascade inspects. Wider costs more and adds nothing. */
const NEIGHBOUR_LIMIT = 5;
const MAX_NORMALIZED_TEXT = 20_000;

export interface MemorySubject {
  channelId: string;
  kind: MemoryItemKind;
  refId: string;
  title: string;
  text: string;
  canonicalUrl?: string | null;
  entities?: readonly string[];
  topics?: readonly string[];
}

export interface ClassifyOptions {
  thresholds?: MemoryThresholds;
  configVersion?: string;
}

export interface RecordDecisionInput {
  channelId: string;
  ideaId?: string | null;
  classification: MemoryClassification;
  correlationId?: string | null;
}

interface Representation {
  normalizedText: string;
  hash: string;
  canonicalUrl: string | null;
  entities: string[];
  topics: string[];
  embedding: readonly number[];
  embeddingModel: string;
  embeddingDim: number;
}

@Injectable()
export class MemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: MemoryRepository,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
  ) {}

  /**
   * Classify first, index second.
   *
   * Indexing a candidate before classifying it would let the item match itself
   * and report a perfect duplicate of nothing. Callers decide what to do with
   * the verdict and only then commit the item to memory.
   */
  async classify(
    subject: MemorySubject,
    options: ClassifyOptions = {},
  ): Promise<MemoryClassification> {
    const representation = await this.represent(subject);
    const exact = await this.findExact(subject, representation);
    const neighbours: MemoryNeighbour[] = exact
      ? []
      : await this.repository.nearest({
          channelId: subject.channelId,
          embedding: representation.embedding,
          limit: NEIGHBOUR_LIMIT,
          excludeRefId: subject.refId,
        });

    const classification = classifyCandidate(
      {
        title: subject.title,
        contentHash: representation.hash,
        canonicalUrl: representation.canonicalUrl,
        entities: representation.entities,
        topics: representation.topics,
      },
      {
        configVersion: options.configVersion ?? MEMORY_CONFIG_VERSION,
        thresholds: options.thresholds ?? DEFAULT_MEMORY_THRESHOLDS,
        exact,
        neighbours,
      },
    );

    // This verdict gates publication, so it is validated rather than trusted,
    // exactly like any other contract crossing a boundary.
    const parsed = memoryClassificationSchema.safeParse(classification);
    if (!parsed.success) {
      throw new AppError('CONTRACT_VIOLATION', 'Memory produced an invalid classification', {
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }
    return parsed.data;
  }

  /** Commits the subject to searchable memory. Idempotent per kind and ref. */
  async index(subject: MemorySubject, state: MemoryItemState = 'ACTIVE'): Promise<string> {
    const representation = await this.represent(subject);
    return this.repository.upsert({
      channelId: subject.channelId,
      kind: subject.kind,
      state,
      refId: subject.refId,
      title: subject.title,
      normalizedText: representation.normalizedText,
      contentHash: representation.hash,
      canonicalUrl: representation.canonicalUrl,
      entities: representation.entities,
      topics: representation.topics,
      embeddingModel: representation.embeddingModel,
      embeddingDim: representation.embeddingDim,
      embedding: representation.embedding,
    });
  }

  async search(
    channelId: string,
    query: string,
    limit = NEIGHBOUR_LIMIT,
  ): Promise<MemoryNeighbour[]> {
    const vector = await this.embeddings.embed(query);
    return this.repository.nearest({ channelId, embedding: vector.values, limit });
  }

  async archive(channelId: string, kind: MemoryItemKind, refId: string): Promise<void> {
    await this.repository.archive(channelId, kind, refId);
  }

  /** Append-only. A blocked candidate keeps the reason that blocked it. */
  async recordDecision(input: RecordDecisionInput): Promise<string> {
    const { classification } = input;
    const entry = await this.prisma.memoryDecisionLog.create({
      data: {
        channelId: input.channelId,
        ideaId: input.ideaId ?? null,
        decision: classification.decision,
        method: classification.method,
        confidence: classification.confidence,
        explanation: classification.explanation,
        matchedMemoryItemId: classification.match?.memoryItemId ?? null,
        distance: classification.match?.distance ?? null,
        entityOverlap: classification.match?.entityOverlap ?? null,
        configVersion: classification.configVersion,
        correlationId: input.correlationId ?? null,
      },
      select: { id: true },
    });
    return entry.id;
  }

  private async represent(subject: MemorySubject): Promise<Representation> {
    const combined = `${subject.title}. ${subject.text}`;
    const vector = await this.embeddings.embed(combined);
    return {
      normalizedText: canonicalizeText(combined).slice(0, MAX_NORMALIZED_TEXT),
      hash: contentHash(combined),
      canonicalUrl: subject.canonicalUrl ?? null,
      entities: [...(subject.entities ?? extractEntities(combined))],
      topics: [...(subject.topics ?? extractTopics(combined))],
      embedding: vector.values,
      embeddingModel: vector.model,
      embeddingDim: vector.dimensions,
    };
  }

  private async findExact(
    subject: MemorySubject,
    representation: Representation,
  ): Promise<ExactMatch | null> {
    const byHash = await this.repository.findByContentHash(
      subject.channelId,
      representation.hash,
      subject.refId,
    );
    if (byHash) return { reason: 'CONTENT_HASH', neighbour: byHash };

    if (representation.canonicalUrl === null) return null;
    const byUrl = await this.repository.findByCanonicalUrl(
      subject.channelId,
      representation.canonicalUrl,
      subject.refId,
    );
    return byUrl ? { reason: 'CANONICAL_URL', neighbour: byUrl } : null;
  }
}
