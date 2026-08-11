/**
 * The embedding boundary. Application code asks for a vector and never learns
 * which model produced it, so M4 can replace the implementation with a hosted
 * model without touching the memory cascade.
 */
export interface EmbeddingVector {
  readonly model: string;
  readonly dimensions: number;
  readonly values: readonly number[];
}

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<EmbeddingVector>;
  embedMany(texts: readonly string[]): Promise<EmbeddingVector[]>;
}

/**
 * Used in tests and for re-ranking candidates already fetched from the database.
 * The ranked search itself stays in SQL so the HNSW index is actually used.
 */
export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

/** pgvector returns cosine distance; the cascade reasons in similarity. */
export function similarityFromDistance(distance: number): number {
  return 1 - distance;
}
