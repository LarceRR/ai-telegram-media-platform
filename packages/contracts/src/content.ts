import { z } from 'zod';
import { jobEnvelopeSchema } from './jobs';

/**
 * M3 vocabulary. Everything here is deterministic: M3 classifies with rules,
 * entity overlap and pgvector distance. The LLM judge arrives in M4 and plugs
 * into `matchMethodSchema` without changing any of these contracts.
 */

/** Rejection is a state, not a deletion: a rejected idea keeps its reason. */
export const contentIdeaStatusSchema = z.enum([
  'DISCOVERED',
  'ANALYZING',
  'CANDIDATE',
  'WAITING_FOR_EVIDENCE',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
  'ARCHIVED',
]);
export type ContentIdeaStatus = z.infer<typeof contentIdeaStatusSchema>;

export const storyStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export type StoryStatus = z.infer<typeof storyStatusSchema>;

/**
 * Directed and typed. `DUPLICATE` blocks publication, `UPDATE` and
 * `CONTINUATION` explicitly allow it, which is the whole point of the graph.
 */
export const storyRelationTypeSchema = z.enum([
  'RELATED',
  'UPDATE',
  'CONTINUATION',
  'DUPLICATE',
]);
export type StoryRelationType = z.infer<typeof storyRelationTypeSchema>;

/** How a match was reached. Stored so any decision can be explained later. */
export const matchMethodSchema = z.enum(['RULE', 'VECTOR', 'LLM', 'HUMAN']);
export type MatchMethod = z.infer<typeof matchMethodSchema>;

export const memoryDecisionSchema = z.enum(['NEW', 'RELATED', 'UPDATE', 'DUPLICATE']);
export type MemoryDecision = z.infer<typeof memoryDecisionSchema>;

export const memoryItemKindSchema = z.enum(['SOURCE_ITEM', 'IDEA', 'STORY', 'PUBLICATION']);
export type MemoryItemKind = z.infer<typeof memoryItemKindSchema>;

export const memoryItemStateSchema = z.enum(['ACTIVE', 'PENDING', 'ARCHIVED']);
export type MemoryItemState = z.infer<typeof memoryItemStateSchema>;

/**
 * The embedding space is a contract, not an implementation detail. Writers and
 * readers that disagree on dimensions or distance produce silently wrong
 * neighbours instead of an error, so both are pinned here and asserted in
 * `embedding_index_metadata`.
 */
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_DISTANCE = 'cosine';
export const MEMORY_CONFIG_VERSION = 'memory-v1';

/**
 * Cosine similarity cut-offs, ordered by strictness. Similarity is a candidate
 * generator, never proof: the cascade still requires entity overlap before it
 * will call two items the same story.
 */
export const memoryThresholdsSchema = z
  .object({
    duplicate: z.number().min(0).max(1),
    update: z.number().min(0).max(1),
    related: z.number().min(0).max(1),
    entityOverlap: z.number().min(0).max(1),
  })
  .refine((t) => t.duplicate >= t.update && t.update >= t.related, {
    message: 'thresholds must be ordered: duplicate >= update >= related',
  });
export type MemoryThresholds = z.infer<typeof memoryThresholdsSchema>;

/** Benchmarked against the M3 fixtures; per-channel overrides come from config. */
export const DEFAULT_MEMORY_THRESHOLDS: MemoryThresholds = {
  duplicate: 0.94,
  update: 0.82,
  related: 0.7,
  entityOverlap: 0.34,
};

export const memoryMatchSchema = z.object({
  memoryItemId: z.string().uuid(),
  kind: memoryItemKindSchema,
  refId: z.string().uuid(),
  title: z.string(),
  /** pgvector cosine distance: 0 identical, 2 opposite. */
  distance: z.number().min(0).max(2),
  similarity: z.number().min(-1).max(1),
  entityOverlap: z.number().min(0).max(1),
});
export type MemoryMatch = z.infer<typeof memoryMatchSchema>;

/** Every classification carries its method, confidence and a readable reason. */
export const memoryClassificationSchema = z.object({
  decision: memoryDecisionSchema,
  method: matchMethodSchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).max(500),
  match: memoryMatchSchema.nullable(),
  configVersion: z.string().min(1),
});
export type MemoryClassification = z.infer<typeof memoryClassificationSchema>;

export const JOB_NAMES_CONTENT = {
  discoverIdeas: 'content.discover-ideas',
  classifyIdea: 'content.classify-idea',
} as const;

export const discoverIdeasJobSchema = jobEnvelopeSchema.extend({
  channelId: z.string().uuid(),
  sourceId: z.string().uuid(),
  /** Empty means "whatever this source has that has no idea yet". */
  sourceItemIds: z.array(z.string().uuid()).max(500).default([]),
});
export type DiscoverIdeasJob = z.infer<typeof discoverIdeasJobSchema>;

export const classifyIdeaJobSchema = jobEnvelopeSchema.extend({
  channelId: z.string().uuid(),
  ideaId: z.string().uuid(),
  configVersion: z.string().min(1).default(MEMORY_CONFIG_VERSION),
});
export type ClassifyIdeaJob = z.infer<typeof classifyIdeaJobSchema>;
