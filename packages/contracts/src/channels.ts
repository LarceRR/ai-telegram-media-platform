import { z } from 'zod';

export const channelModeSchema = z.enum(['MODERATED', 'AUTO']);
export const channelRoleSchema = z.enum(['OWNER', 'EDITOR', 'OPERATOR', 'VIEWER']);
export const channelStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']);

export const channelSettingsSchema = z.object({
  mode: channelModeSchema,
  timezone: z.string().min(1),
  minInterest: z.number().int().min(0).max(10),
  minQuality: z.number().int().min(0).max(10),
  minEvidence: z.number().int().min(0).max(10),
  minOriginality: z.number().int().min(0).max(10),
  researchMaxLevel: z.number().int().min(0).max(3),
  minLength: z.number().int().nonnegative().nullable(),
  maxLength: z.number().int().positive().nullable(),
  emojiEnabled: z.boolean(),
  forbiddenTopics: z.array(z.string()),
  legalRestrictions: z.array(z.string()),
  sourcePriorities: z.record(z.number()),
  styleConfig: z.record(z.unknown()),
  version: z.number().int().positive(),
});
export type ChannelSettings = z.infer<typeof channelSettingsSchema>;

export const channelResponseSchema = z.object({
  id: z.string().uuid(),
  telegramId: z.string().min(1),
  title: z.string().min(1),
  username: z.string().nullable(),
  language: z.string().min(2),
  status: channelStatusSchema,
  role: channelRoleSchema,
  settings: channelSettingsSchema,
  telegramCredentialConfigured: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ChannelResponse = z.infer<typeof channelResponseSchema>;
