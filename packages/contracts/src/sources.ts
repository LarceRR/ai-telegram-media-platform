import { z } from 'zod';
import { jobEnvelopeSchema } from './jobs';

export const sourceTypeSchema = z.enum(['RSS', 'WEB']);
export type SourceType = z.infer<typeof sourceTypeSchema>;
export const sourceStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'DISABLED']);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const sourceItemPayloadSchema = z.object({
  externalItemId: z.string().min(1).max(512), canonicalUrl: z.string().url(), title: z.string().min(1).max(500),
  author: z.string().max(300).optional(), publishedAt: z.string().datetime().optional(), text: z.string().min(1).max(500_000),
  images: z.array(z.object({ url: z.string().url(), alt: z.string().max(500).optional() })).max(20).default([]),
});
export type SourceItemPayload = z.infer<typeof sourceItemPayloadSchema>;
export const ingestSourceJobSchema = jobEnvelopeSchema.extend({ sourceId: z.string().uuid(), channelId: z.string().uuid(), cursor: z.string().max(2_000).optional() });
export type IngestSourceJob = z.infer<typeof ingestSourceJobSchema>;
export const JOB_NAMES_SOURCES = { ingestSource: 'sources.ingest' } as const;
export const sourceResponseSchema = z.object({
  id: z.string().uuid(), channelId: z.string().uuid(), name: z.string(), type: sourceTypeSchema, url: z.string().url(),
  status: sourceStatusSchema, priority: z.number().int(), lastIngestedAt: z.string().datetime().nullable(), lastHealthStatus: z.string().nullable(),
});
export type SourceResponse = z.infer<typeof sourceResponseSchema>;
