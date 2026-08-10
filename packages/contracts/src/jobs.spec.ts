import { healthProbeJobSchema, idempotencyKeys, jobEnvelopeSchema, toJobId } from './jobs';
import { DEFAULT_QUEUE_POLICIES, QUEUE_NAMES } from './queues';

describe('job contracts', () => {
  const envelope = {
    correlationId: '3f0f8f6a-2b1a-4f3e-9b5c-7d8e9f0a1b2c',
    enqueuedAt: new Date().toISOString(),
    enqueuedBy: 'api' as const,
  };

  it('accepts a valid envelope and defaults the attempt hint', () => {
    const parsed = jobEnvelopeSchema.parse(envelope);
    expect(parsed.attemptHint).toBe(0);
  });

  it('rejects a non-uuid correlation id', () => {
    expect(() => jobEnvelopeSchema.parse({ ...envelope, correlationId: 'nope' })).toThrow();
  });

  it('validates the health probe payload', () => {
    expect(healthProbeJobSchema.parse({ ...envelope, probeId: 'probe-1' }).probeId).toBe('probe-1');
  });

  it('builds stable idempotency keys', () => {
    expect(idempotencyKeys.publication('post', 'chan', '2026-08-10T18:00:00Z')).toBe(
      'publish:post:chan:2026-08-10T18:00:00Z',
    );
    expect(idempotencyKeys.ingestion('src', 'item')).toBe('ingest:src:item');
  });

  it('defines a policy for every queue', () => {
    for (const queue of QUEUE_NAMES) {
      expect(DEFAULT_QUEUE_POLICIES[queue]).toBeDefined();
    }
  });

  describe('toJobId', () => {
    it('removes every colon, which BullMQ forbids in custom ids', () => {
      const jobId = toJobId(idempotencyKeys.publication('p1', 'c1', '2026-08-10T18:00:00Z'));
      expect(jobId).not.toContain(':');
    });

    it('is deterministic', () => {
      const key = idempotencyKeys.ingestion('src', 'item');
      expect(toJobId(key)).toBe(toJobId(key));
    });

    it('never maps two different keys onto the same job id', () => {
      expect(toJobId('a:b_c')).not.toBe(toJobId('a_b:c'));
    });

    it('keeps distinct scheduled slots distinct', () => {
      const first = toJobId(idempotencyKeys.publication('p', 'c', '2026-08-10T18:00:00Z'));
      const second = toJobId(idempotencyKeys.publication('p', 'c', '2026-08-10T19:00:00Z'));
      expect(first).not.toBe(second);
    });
  });
});
