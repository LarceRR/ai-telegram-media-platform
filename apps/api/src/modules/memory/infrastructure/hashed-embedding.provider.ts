import { Injectable } from '@nestjs/common';
import { EMBEDDING_DIMENSIONS } from '@atmp/contracts';
import { bigrams, tokenize } from '@atmp/shared';
import type { EmbeddingProvider, EmbeddingVector } from '../domain/embedding';

/**
 * Hashed bag-of-words with signed buckets, unigrams plus bigrams, sublinear term
 * weighting and L2 normalization.
 *
 * Why not a hosted model in M3: the duplicate cascade must be provable in CI,
 * and a network call would make every test non-deterministic, rate limited and
 * billable. This provider is offline, stable across runs and good enough to
 * separate "same article reworded" from "different article". The model name is
 * persisted with every vector, so replacing it in M4 forces a visible re-index
 * instead of silently degrading recall.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SIGN_SEED = 0x9e3779b9;
/** A bigram is corroborating evidence, not a fact of its own. */
const BIGRAM_WEIGHT = 0.5;

function fnv1a(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

@Injectable()
export class HashedEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'hashed-bow-v1';
  readonly dimensions = EMBEDDING_DIMENSIONS;

  embed(text: string): Promise<EmbeddingVector> {
    return Promise.resolve(this.compute(text));
  }

  embedMany(texts: readonly string[]): Promise<EmbeddingVector[]> {
    return Promise.resolve(texts.map((text) => this.compute(text)));
  }

  private compute(text: string): EmbeddingVector {
    const values = new Array<number>(this.dimensions).fill(0);
    const unigrams = tokenize(text);
    const counts = new Map<string, number>();

    for (const term of unigrams) counts.set(term, (counts.get(term) ?? 0) + 1);
    for (const term of bigrams(unigrams)) counts.set(term, (counts.get(term) ?? 0) + 1);

    for (const [term, count] of counts) {
      const bucket = fnv1a(term, FNV_OFFSET) % this.dimensions;
      // A signed bucket lets collisions cancel instead of always inflating.
      const sign = (fnv1a(term, SIGN_SEED) & 1) === 0 ? 1 : -1;
      const weight = (1 + Math.log(count)) * (term.includes(' ') ? BIGRAM_WEIGHT : 1);
      values[bucket] = (values[bucket] ?? 0) + sign * weight;
    }

    let norm = 0;
    for (const value of values) norm += value * value;
    norm = Math.sqrt(norm);

    if (norm === 0) {
      // Empty or stopword-only text. A zero vector has no cosine distance at
      // all, so pin it to one deterministic bucket instead.
      const bucket = fnv1a(text, FNV_OFFSET) % this.dimensions;
      values[bucket] = 1;
      return { model: this.model, dimensions: this.dimensions, values };
    }

    for (let index = 0; index < values.length; index += 1) {
      values[index] = (values[index] ?? 0) / norm;
    }
    return { model: this.model, dimensions: this.dimensions, values };
  }
}
