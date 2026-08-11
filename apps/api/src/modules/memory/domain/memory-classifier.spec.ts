import { DEFAULT_MEMORY_THRESHOLDS, MEMORY_CONFIG_VERSION } from '@atmp/contracts';
import { classifyCandidate, type MemoryCandidate, type MemoryNeighbour } from './memory-classifier';

const candidate: MemoryCandidate = {
  title: 'Central bank raises the key rate',
  contentHash: 'a'.repeat(64),
  canonicalUrl: 'https://news.test/rate',
  entities: ['central', 'bank'],
  topics: ['rate', 'inflation'],
};

function neighbour(overrides: Partial<MemoryNeighbour> = {}): MemoryNeighbour {
  return {
    memoryItemId: '11111111-1111-4111-8111-111111111111',
    kind: 'IDEA',
    refId: '22222222-2222-4222-8222-222222222222',
    title: 'Central bank lifts the key rate',
    contentHash: 'b'.repeat(64),
    canonicalUrl: 'https://news.test/other',
    entities: ['central', 'bank'],
    topics: ['rate', 'inflation'],
    distance: 0.02,
    ...overrides,
  };
}

const context = { configVersion: MEMORY_CONFIG_VERSION, thresholds: DEFAULT_MEMORY_THRESHOLDS };

describe('classifyCandidate', () => {
  it('treats an identical content hash as a certain duplicate', () => {
    const result = classifyCandidate(candidate, {
      ...context,
      exact: { reason: 'CONTENT_HASH', neighbour: neighbour() },
    });

    expect(result.decision).toBe('DUPLICATE');
    expect(result.method).toBe('RULE');
    expect(result.confidence).toBe(1);
    expect(result.match?.memoryItemId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('treats a repeated canonical URL as a duplicate without consulting vectors', () => {
    const result = classifyCandidate(candidate, {
      ...context,
      exact: { reason: 'CANONICAL_URL', neighbour: neighbour() },
      neighbours: [],
    });

    expect(result.decision).toBe('DUPLICATE');
    expect(result.method).toBe('RULE');
  });

  it('classifies the first item in a channel as new', () => {
    const result = classifyCandidate(candidate, { ...context, neighbours: [] });

    expect(result.decision).toBe('NEW');
    expect(result.match).toBeNull();
    expect(result.explanation).toMatch(/no comparable item/i);
  });

  it('calls a near-identical neighbour a duplicate when the entities agree', () => {
    const result = classifyCandidate(candidate, { ...context, neighbours: [neighbour()] });

    expect(result.decision).toBe('DUPLICATE');
    expect(result.method).toBe('VECTOR');
  });

  it('refuses to call something a duplicate when the entities disagree', () => {
    const result = classifyCandidate(candidate, {
      ...context,
      neighbours: [neighbour({ entities: ['volcano'], topics: ['flights', 'iceland'] })],
    });

    expect(result.decision).toBe('RELATED');
    expect(result.explanation).toMatch(/entities disagree/i);
  });

  it('calls a same-subject item with new material an update', () => {
    const result = classifyCandidate(candidate, {
      ...context,
      neighbours: [neighbour({ distance: 0.12 })],
    });

    expect(result.decision).toBe('UPDATE');
  });

  it('falls back to new once the nearest neighbour is far enough away', () => {
    const result = classifyCandidate(candidate, {
      ...context,
      neighbours: [neighbour({ distance: 0.8 })],
    });

    expect(result.decision).toBe('NEW');
    expect(result.match).not.toBeNull();
  });

  it('picks the closest neighbour, not the first one returned', () => {
    const result = classifyCandidate(candidate, {
      ...context,
      neighbours: [
        neighbour({ distance: 0.9, title: 'Far away' }),
        neighbour({ distance: 0.01, title: 'Almost the same' }),
      ],
    });

    expect(result.decision).toBe('DUPLICATE');
    expect(result.match?.title).toBe('Almost the same');
  });

  it('always explains itself and stamps the config version', () => {
    const result = classifyCandidate(candidate, { ...context, neighbours: [neighbour()] });

    expect(result.explanation.length).toBeGreaterThan(0);
    expect(result.explanation.length).toBeLessThanOrEqual(500);
    expect(result.configVersion).toBe(MEMORY_CONFIG_VERSION);
  });
});
