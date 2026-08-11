import {
  DEFAULT_MEMORY_THRESHOLDS,
  EMBEDDING_DIMENSIONS,
  MEMORY_CONFIG_VERSION,
  classifyIdeaJobSchema,
  discoverIdeasJobSchema,
  memoryClassificationSchema,
  memoryThresholdsSchema,
} from './content';
import { idempotencyKeys, toJobId } from './jobs';

describe('content intelligence contracts', () => {
  const envelope = {
    correlationId: '3f0f8f6a-2b1a-4f3e-9b5c-7d8e9f0a1b2c',
    enqueuedAt: new Date().toISOString(),
    enqueuedBy: 'worker' as const,
  };
  const channelId = '11111111-1111-4111-8111-111111111111';
  const sourceId = '22222222-2222-4222-8222-222222222222';
  const ideaId = '33333333-3333-4333-8333-333333333333';

  it('keeps the default thresholds ordered', () => {
    expect(() => memoryThresholdsSchema.parse(DEFAULT_MEMORY_THRESHOLDS)).not.toThrow();
  });

  it('rejects thresholds that would make UPDATE stricter than DUPLICATE', () => {
    expect(() =>
      memoryThresholdsSchema.parse({ ...DEFAULT_MEMORY_THRESHOLDS, update: 0.99 }),
    ).toThrow();
  });

  it('pins the embedding space so writers and readers cannot drift apart', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it('defaults a discovery batch to the whole backlog of a source', () => {
    const parsed = discoverIdeasJobSchema.parse({ ...envelope, channelId, sourceId });
    expect(parsed.sourceItemIds).toEqual([]);
  });

  it('stamps the memory config version onto every classification job', () => {
    const parsed = classifyIdeaJobSchema.parse({ ...envelope, channelId, ideaId });
    expect(parsed.configVersion).toBe(MEMORY_CONFIG_VERSION);
  });

  it('requires an explanation on every classification', () => {
    expect(() =>
      memoryClassificationSchema.parse({
        decision: 'DUPLICATE',
        method: 'VECTOR',
        confidence: 0.97,
        explanation: '',
        match: null,
        configVersion: MEMORY_CONFIG_VERSION,
      }),
    ).toThrow();
  });

  it('builds discovery and classification keys that survive BullMQ encoding', () => {
    const discovery = idempotencyKeys.discovery(channelId, sourceId, 'batch-1');
    const classification = idempotencyKeys.ideaClassification(
      channelId,
      ideaId,
      MEMORY_CONFIG_VERSION,
    );

    expect(discovery).toBe(`discover:${channelId}:${sourceId}:batch-1`);
    expect(toJobId(discovery)).not.toContain(':');
    expect(toJobId(classification)).not.toBe(
      toJobId(idempotencyKeys.ideaClassification(channelId, ideaId, 'memory-v2')),
    );
  });
});
