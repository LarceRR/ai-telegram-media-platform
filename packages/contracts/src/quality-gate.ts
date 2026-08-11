import { z } from 'zod';

export const qualityGateInputSchema = z.object({
  interest: z.number().min(0).max(10), quality: z.number().min(0).max(10), evidence: z.number().min(0).max(10), originality: z.number().min(0).max(10),
  minInterest: z.number().min(0).max(10), minQuality: z.number().min(0).max(10), minEvidence: z.number().min(0).max(10), minOriginality: z.number().min(0).max(10),
  hasUnverifiedClaims: z.boolean(), mode: z.enum(['MODERATED', 'AUTO']),
});
export type QualityGateInput = z.infer<typeof qualityGateInputSchema>;
export type QualityGateDecision = 'PUBLISH' | 'REVIEW' | 'REGENERATE' | 'WAIT' | 'REJECT';

export function evaluateQualityGate(input: QualityGateInput): QualityGateDecision {
  const value = qualityGateInputSchema.parse(input);
  if (value.hasUnverifiedClaims || value.evidence < value.minEvidence) return 'WAIT';
  if (value.interest < value.minInterest || value.quality < value.minQuality || value.originality < value.minOriginality) return 'REGENERATE';
  return value.mode === 'MODERATED' ? 'REVIEW' : 'PUBLISH';
}
