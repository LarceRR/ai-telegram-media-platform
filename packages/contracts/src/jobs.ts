import { z } from 'zod';

/** Every job carries correlation and provenance metadata. No anonymous jobs. */
export const jobEnvelopeSchema = z.object({
  correlationId: z.string().uuid(),
  enqueuedAt: z.string().datetime(),
  enqueuedBy: z.enum(['api', 'worker', 'scheduler', 'admin']),
  attemptHint: z.number().int().nonnegative().default(0),
});
export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

export const JOB_NAMES = {
  systemHealthProbe: 'system.health-probe',
} as const;

export const healthProbeJobSchema = jobEnvelopeSchema.extend({
  probeId: z.string().min(1),
  note: z.string().max(200).optional(),
});
export type HealthProbeJob = z.infer<typeof healthProbeJobSchema>;

/**
 * Deterministic idempotency keys. Re-enqueuing the same logical work must reuse
 * the same key so retries can never duplicate content or double-send messages.
 */
export const idempotencyKeys = {
  ingestion: (sourceId: string, externalItemId: string) => `ingest:${sourceId}:${externalItemId}`,
  /**
   * One ingestion run per source, channel and rate-limit window. The window is
   * what makes a manual re-trigger possible at all: a key without it would
   * collide with the completed job still held by the queue, and the second
   * trigger would silently do nothing.
   */
  ingestionRun: (sourceId: string, channelId: string, windowStart: string) =>
    `ingest-run:${sourceId}:${channelId}:${windowStart}`,
  /**
   * One discovery run per channel, source and batch. `batchKey` is derived from
   * the item ids being handed over, so an ingestion that produced nothing new
   * cannot spawn a second identical discovery pass.
   */
  discovery: (channelId: string, sourceId: string, batchKey: string) =>
    `discover:${channelId}:${sourceId}:${batchKey}`,
  /**
   * Classification is keyed by the memory config version: changing thresholds
   * or the embedding model is genuinely new work, re-running the same version
   * is not.
   */
  ideaClassification: (channelId: string, ideaId: string, configVersion: string) =>
    `classify:${channelId}:${ideaId}:${configVersion}`,
  generation: (storyId: string, channelId: string, pipelineConfigVersion: string) =>
    `generate:${storyId}:${channelId}:${pipelineConfigVersion}`,
  publication: (postId: string, channelId: string, scheduledSlot: string) =>
    `publish:${postId}:${channelId}:${scheduledSlot}`,
  analytics: (publicationId: string, metricWindow: string) =>
    `analytics:${publicationId}:${metricWindow}`,
  scheduling: (channelId: string, postId: string, slot: string) =>
    `schedule:${channelId}:${postId}:${slot}`,
  healthProbe: (probeId: string) => `health-probe:${probeId}`,
} as const;

/**
 * BullMQ rejects custom job ids containing ':', which is exactly the separator
 * our keys use, and publication keys also embed an ISO timestamp full of colons.
 *
 * Simply deleting colons would be lossy: `a:b_c` and `a_b:c` would collapse onto
 * the same id and silently break idempotency. Doubling underscores first keeps
 * the encoding injective, so distinct keys always produce distinct job ids.
 */
export function toJobId(idempotencyKey: string): string {
  return idempotencyKey.replace(/_/g, '__').replace(/:/g, '_');
}
