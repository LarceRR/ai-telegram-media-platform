import { EMBEDDING_DIMENSIONS } from '@atmp/contracts';
import { cosineSimilarity, similarityFromDistance } from '../domain/embedding';
import { HashedEmbeddingProvider } from './hashed-embedding.provider';

describe('HashedEmbeddingProvider', () => {
  const provider = new HashedEmbeddingProvider();

  const original =
    'The central bank raised the key rate to five percent, citing persistent inflation.';
  const reworded =
    'Citing persistent inflation, the central bank raised its key rate to five percent.';
  const unrelated = 'A volcano erupted overnight in Iceland, grounding regional flights.';

  it('produces vectors in the contracted space', async () => {
    const vector = await provider.embed(original);
    expect(vector.dimensions).toBe(EMBEDDING_DIMENSIONS);
    expect(vector.values).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(vector.model).toBe('hashed-bow-v1');
  });

  it('is L2 normalized, so cosine distance is comparable across items', async () => {
    const { values } = await provider.embed(original);
    const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it('is deterministic across calls', async () => {
    const first = await provider.embed(original);
    const second = await provider.embed(original);
    expect(first.values).toEqual(second.values);
  });

  it('scores a reworded version far above an unrelated article', async () => {
    const [a, b, c] = await provider.embedMany([original, reworded, unrelated]);
    const near = cosineSimilarity(a?.values ?? [], b?.values ?? []);
    const far = cosineSimilarity(a?.values ?? [], c?.values ?? []);

    expect(near).toBeGreaterThan(0.6);
    expect(far).toBeLessThan(0.2);
    expect(near).toBeGreaterThan(far);
  });

  it('separates two texts that share words but not word order', async () => {
    const [a, b] = await provider.embedMany([
      'the bank raises the rate',
      'the rate raises the bank',
    ]);
    expect(cosineSimilarity(a?.values ?? [], b?.values ?? [])).toBeLessThan(1);
  });

  it('never returns a zero vector for empty text', async () => {
    const { values } = await provider.embed('   ');
    expect(values.some((value) => value !== 0)).toBe(true);
  });

  it('converts pgvector distance back into similarity', () => {
    expect(similarityFromDistance(0)).toBe(1);
    expect(similarityFromDistance(0.2)).toBeCloseTo(0.8, 10);
  });
});
