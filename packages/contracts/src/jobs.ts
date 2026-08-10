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
