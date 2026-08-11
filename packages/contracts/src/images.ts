import { z } from 'zod';

export const imageCandidateSchema = z.object({
  sourceItemId: z.string().uuid(),
  sourceImageId: z.string().uuid(),
  url: z.string().url(),
  alt: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  mimeType: z.string().nullable().optional(),
  score: z.number().min(0).max(1).default(0),
});
export type ImageCandidate = z.infer<typeof imageCandidateSchema>;

export const imageSelectionRequestSchema = z.object({
  sourceItemId: z.string().uuid(),
  candidates: z.array(imageCandidateSchema).max(20),
});
export type ImageSelectionRequest = z.infer<typeof imageSelectionRequestSchema>;

export const imageSelectionResultSchema = z.object({
  selectedSourceImageId: z.string().uuid().nullable(),
  reason: z.enum(['BEST_VALID_CANDIDATE', 'NO_VALID_CANDIDATE']),
  candidateCount: z.number().int().nonnegative(),
});
export type ImageSelectionResult = z.infer<typeof imageSelectionResultSchema>;
