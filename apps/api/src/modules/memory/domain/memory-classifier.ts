import {
  DEFAULT_MEMORY_THRESHOLDS,
  type MatchMethod,
  type MemoryClassification,
  type MemoryDecision,
  type MemoryItemKind,
  type MemoryMatch,
  type MemoryThresholds,
} from '@atmp/contracts';
import { jaccard } from '@atmp/shared';
import { similarityFromDistance } from './embedding';

/**
 * The Smart Memory decision rules. Pure on purpose: no database, no embedding
 * call, no clock. Everything that decides whether content is blocked has to be
 * reproducible from its inputs alone.
 */

export interface MemoryCandidate {
  title: string;
  contentHash: string;
  canonicalUrl: string | null;
  entities: readonly string[];
  topics: readonly string[];
}

export interface MemoryNeighbour {
  memoryItemId: string;
  kind: MemoryItemKind;
  refId: string;
  title: string;
  contentHash: string;
  canonicalUrl: string | null;
  entities: readonly string[];
  topics: readonly string[];
  /** pgvector cosine distance: 0 identical, 2 opposite. */
  distance: number;
}

export type ExactMatchReason = 'CONTENT_HASH' | 'CANONICAL_URL';

export interface ExactMatch {
  reason: ExactMatchReason;
  neighbour: MemoryNeighbour;
}

export interface ClassificationContext {
  configVersion: string;
  thresholds?: MemoryThresholds;
  /** Result of the deterministic prefilters, if either of them hit. */
  exact?: ExactMatch | null;
  neighbours?: readonly MemoryNeighbour[];
}

const MAX_EXPLANATION = 500;

export function classifyCandidate(
  candidate: MemoryCandidate,
  context: ClassificationContext,
): MemoryClassification {
  const thresholds = context.thresholds ?? DEFAULT_MEMORY_THRESHOLDS;
  const configVersion = context.configVersion;

  // 1. Deterministic prefilters. Cheaper than a vector scan and not arguable.
  if (context.exact) {
    const { neighbour, reason } = context.exact;
    const label = describe(neighbour);
    return build({
      decision: 'DUPLICATE',
      method: 'RULE',
      confidence: reason === 'CONTENT_HASH' ? 1 : 0.95,
      explanation:
        reason === 'CONTENT_HASH'
          ? `Identical normalized content is already stored as ${label}.`
          : `The same canonical URL is already stored as ${label}.`,
      match: toMatch(candidate, neighbour),
      configVersion,
    });
  }

  // 2. Nearest neighbour in the channel's live memory.
  const best = bestNeighbour(context.neighbours ?? []);
  if (!best) {
    return build({
      decision: 'NEW',
      method: 'RULE',
      confidence: 1,
      explanation: 'No comparable item exists in this channel yet.',
      match: null,
      configVersion,
    });
  }

  const similarity = clamp(similarityFromDistance(best.distance), -1, 1);
  const overlap = jaccard(
    [...candidate.entities, ...candidate.topics],
    [...best.entities, ...best.topics],
  );
  const match = toMatch(candidate, best, similarity, overlap);
  const label = describe(best);
  const numbers = `similarity ${round(similarity)}, entity overlap ${round(overlap)}`;
  const overlapAgrees = overlap >= thresholds.entityOverlap;

  if (similarity >= thresholds.duplicate && overlapAgrees) {
    return build({
      decision: 'DUPLICATE',
      method: 'VECTOR',
      confidence: similarity,
      explanation: `Materially equivalent to ${label} (${numbers}).`,
      match,
      configVersion,
    });
  }

  if (similarity >= thresholds.update && overlapAgrees) {
    return build({
      decision: 'UPDATE',
      method: 'VECTOR',
      confidence: similarity,
      explanation: `Same subject as ${label} with new material (${numbers}).`,
      match,
      configVersion,
    });
  }

  if (similarity >= thresholds.related) {
    /**
     * Similarity on its own is a candidate generator, never proof. Two distinct
     * events in one domain read almost identically to an embedding, so without
     * agreeing entities the strongest available claim is "related".
     */
    const reason = overlapAgrees
      ? `Adjacent to ${label} without enough evidence of an update`
      : `Close to ${label} but the entities disagree, so it is not treated as a duplicate`;
    return build({
      decision: 'RELATED',
      method: 'VECTOR',
      confidence: similarity,
      explanation: `${reason} (${numbers}).`,
      match,
      configVersion,
    });
  }

  return build({
    decision: 'NEW',
    method: 'VECTOR',
    confidence: clamp(1 - similarity, 0, 1),
    explanation: `Nearest memory is ${label}, below the related threshold (${numbers}).`,
    match,
    configVersion,
  });
}

function bestNeighbour(neighbours: readonly MemoryNeighbour[]): MemoryNeighbour | null {
  let best: MemoryNeighbour | null = null;
  for (const neighbour of neighbours) {
    if (best === null || neighbour.distance < best.distance) best = neighbour;
  }
  return best;
}

function toMatch(
  candidate: MemoryCandidate,
  neighbour: MemoryNeighbour,
  similarity?: number,
  overlap?: number,
): MemoryMatch {
  const resolvedSimilarity = similarity ?? clamp(similarityFromDistance(neighbour.distance), -1, 1);
  const resolvedOverlap =
    overlap ??
    jaccard(
      [...candidate.entities, ...candidate.topics],
      [...neighbour.entities, ...neighbour.topics],
    );
  return {
    memoryItemId: neighbour.memoryItemId,
    kind: neighbour.kind,
    refId: neighbour.refId,
    title: neighbour.title,
    distance: clamp(neighbour.distance, 0, 2),
    similarity: resolvedSimilarity,
    entityOverlap: clamp(resolvedOverlap, 0, 1),
  };
}

function build(input: {
  decision: MemoryDecision;
  method: MatchMethod;
  confidence: number;
  explanation: string;
  match: MemoryMatch | null;
  configVersion: string;
}): MemoryClassification {
  return {
    decision: input.decision,
    method: input.method,
    confidence: clamp(input.confidence, 0, 1),
    explanation: input.explanation.slice(0, MAX_EXPLANATION),
    match: input.match,
    configVersion: input.configVersion,
  };
}

function describe(neighbour: MemoryNeighbour): string {
  return `${neighbour.kind.toLowerCase().replace(/_/g, ' ')} "${neighbour.title.slice(0, 80)}"`;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number): string {
  return value.toFixed(2);
}
