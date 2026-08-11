import { z } from 'zod';
import { jobEnvelopeSchema } from './jobs';

export const researchLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type ResearchLevel = z.infer<typeof researchLevelSchema>;
export const evidenceStatusSchema = z.enum(['SUPPORTS', 'CONTRADICTS', 'INCONCLUSIVE', 'UNVERIFIED']);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export const evidenceTypeSchema = z.enum(['SOURCE_ITEM', 'EXTERNAL_SOURCE', 'PRIMARY_DOCUMENT', 'EXPERT']);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

export const researchDecisionSchema = z.object({
  level: researchLevelSchema,
  rationale: z.string().min(1).max(500),
  requiredEvidenceCount: z.number().int().nonnegative().max(20),
  mandatoryIndependentSource: z.boolean(),
  configVersion: z.string().min(1),
});
export type ResearchDecision = z.infer<typeof researchDecisionSchema>;

export const evidenceSchema = z.object({
  type: evidenceTypeSchema,
  status: evidenceStatusSchema,
  sourceId: z.string().uuid().nullable(),
  sourceItemId: z.string().uuid().nullable(),
  url: z.string().url().nullable(),
  title: z.string().max(500),
  quote: z.string().max(5_000),
  retrievedAt: z.string().datetime(),
  method: z.enum(['ADAPTER', 'AI', 'HUMAN']),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const researchRunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED']);
export type ResearchRunStatus = z.infer<typeof researchRunStatusSchema>;

export const researchJobSchema = jobEnvelopeSchema.extend({
  channelId: z.string().uuid(),
  ideaId: z.string().uuid(),
  level: researchLevelSchema,
  configVersion: z.string().min(1),
});
export type ResearchJob = z.infer<typeof researchJobSchema>;

export const RESEARCH_CONFIG_VERSION = 'research-v1';
