import { z } from 'zod';

export const moderationActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REQUEST_REGENERATION']),
  reason: z.string().trim().min(3).max(1000),
  expectedVersion: z.number().int().positive().optional(),
});
export type ModerationAction = z.infer<typeof moderationActionSchema>;

export const moderationStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REGENERATION_REQUESTED']);
export type ModerationStatus = z.infer<typeof moderationStatusSchema>;
