import { z } from 'zod';
import { claimSchema } from './writing';

export const claimVerificationSchema = z.object({
  claim: claimSchema,
  verdict: z.enum(['SUPPORTED', 'CONTRADICTED', 'UNVERIFIED']),
  explanation: z.string().min(1).max(500),
  evidenceIds: z.array(z.string().uuid()).max(50),
});
export type ClaimVerification = z.infer<typeof claimVerificationSchema>;

export const scoreDimensionSchema = z.enum(['INTEREST', 'QUALITY', 'EVIDENCE', 'ORIGINALITY', 'VIRALITY_POTENTIAL']);
export type ScoreDimension = z.infer<typeof scoreDimensionSchema>;
export const scoreSchema = z.object({
  dimension: scoreDimensionSchema,
  value: z.number().min(0).max(10),
  rationale: z.string().min(1).max(500),
});
export type Score = z.infer<typeof scoreSchema>;

export const scoringResultSchema = z.object({
  scores: z.array(scoreSchema).length(5),
  allClaimsVerified: z.boolean(),
  configVersion: z.string().min(1),
});
export type ScoringResult = z.infer<typeof scoringResultSchema>;
