import { z } from 'zod';

export const claimStatusSchema = z.enum(['UNVERIFIED', 'SUPPORTED', 'CONTRADICTED', 'MISSING_EVIDENCE']);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

export const claimSchema = z.object({
  text: z.string().min(1).max(2_000),
  status: claimStatusSchema,
  evidenceIds: z.array(z.string().uuid()).max(50),
  confidence: z.number().min(0).max(1),
});
export type Claim = z.infer<typeof claimSchema>;

export const postDraftSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(20_000),
  claims: z.array(claimSchema).max(100),
  sourceStoryId: z.string().uuid(),
  promptVersion: z.string().min(1),
});
export type PostDraft = z.infer<typeof postDraftSchema>;

export const writingRequestSchema = z.object({
  storyId: z.string().uuid(),
  evidenceIds: z.array(z.string().uuid()).max(100),
  channelLanguage: z.string().min(2).max(20),
  promptVersion: z.string().min(1),
});
export type WritingRequest = z.infer<typeof writingRequestSchema>;
