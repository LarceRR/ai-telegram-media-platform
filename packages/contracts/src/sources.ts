import { z } from 'zod';
import { jobEnvelopeSchema } from './jobs';

export const sourceTypeSchema = z.enum(['RSS', 'WEB']);
export type SourceType = z.infer<typeof sourceTypeSchema>;
export const sourceStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'DISABLED']);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;
export const sourceHealthStatusSchema = z.enum(['HEALTHY', 'DEGRADED', 'FAILED']);
export type SourceHealthStatus = z.infer<typeof sourceHealthStatusSchema>;

export const sourceItemImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().max(500).optional(),
});
export type SourceItemImage = z.infer<typeof sourceItemImageSchema>;

export const sourceItemPayloadSchema = z.object({
  externalItemId: z.string().min(1).max(512),
  canonicalUrl: z.string().url(),
  title: z.string().min(1).max(500),
  author: z.string().max(300).optional(),
  publishedAt: z.string().datetime().optional(),
  text: z.string().min(1).max(500_000),
  images: z.array(sourceItemImageSchema).max(20).default([]),
});
export type SourceItemPayload = z.infer<typeof sourceItemPayloadSchema>;

export const ingestSourceJobSchema = jobEnvelopeSchema.extend({
  sourceId: z.string().uuid(),
  channelId: z.string().uuid(),
  cursor: z.string().max(2_000).optional(),
});
export type IngestSourceJob = z.infer<typeof ingestSourceJobSchema>;
export const JOB_NAMES_SOURCES = { ingestSource: 'sources.ingest' } as const;

/**
 * Adapter cursor persisted between fetches. Opaque to the application layer,
 * which stores and replays it verbatim; only the adapter interprets it.
 *
 * `etag` and `lastModified` drive conditional GET, `newestPublishedAt` is the
 * feed watermark, `contentHash` detects an unchanged page.
 */
export const httpSourceCursorSchema = z.object({
  v: z.literal(1),
  etag: z.string().max(300).optional(),
  lastModified: z.string().max(200).optional(),
  newestPublishedAt: z.string().datetime().optional(),
  contentHash: z.string().length(64).optional(),
});
export type HttpSourceCursor = z.infer<typeof httpSourceCursorSchema>;

export const sourceResponseSchema = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid(),
  name: z.string(),
  type: sourceTypeSchema,
  url: z.string().url(),
  status: sourceStatusSchema,
  categories: z.array(z.string()),
  priority: z.number().int(),
  enabled: z.boolean(),
  lastIngestedAt: z.string().datetime().nullable(),
  lastHealthStatus: sourceHealthStatusSchema.nullable(),
});
export type SourceResponse = z.infer<typeof sourceResponseSchema>;

export const sourceIngestAcceptedSchema = z.object({
  sourceId: z.string().uuid(),
  jobId: z.string().min(1),
});
export type SourceIngestAccepted = z.infer<typeof sourceIngestAcceptedSchema>;

export const sourceHealthReportSchema = z.object({
  status: sourceHealthStatusSchema,
  latencyMs: z.number().int().nonnegative(),
  httpStatus: z.number().int().nullable(),
  errorCategory: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type SourceHealthReportContract = z.infer<typeof sourceHealthReportSchema>;
