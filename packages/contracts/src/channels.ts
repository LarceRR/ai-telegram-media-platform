import { z } from 'zod';

export const channelModeSchema = z.enum(['MODERATED', 'AUTO']);
export const channelRoleSchema = z.enum(['OWNER', 'EDITOR', 'VIEWER']);

export const channelSettingsSchema = z.object({
  minInterest: z.number().int().min(0).max(10),
  minQuality: z.number().int().min(0).max(10),
  minEvidence: z.number().int().min(0).max(10),
  minOriginality: z.number().int().min(0).max(10),
  researchMaxLevel: z.number().int().min(0).max(3),
  forbiddenTopics: z.array(z.string()),
  legalRestrictions: z.array(z.string()),
  blacklist: z.array(z.string()),
  hookStyle: z.string().min(1).max(80),
  maxLength: z.number().int().min(80).max(10000),
  emojiPolicy: z.boolean(),
  version: z.number().int().positive(),
});
export type ChannelSettings = z.infer<typeof channelSettingsSchema>;

export const channelResponseSchema = z.object({
  id: z.string().uuid(),
  telegramChatId: z.string().min(1),
  title: z.string().min(1),
  username: z.string().nullable(),
  language: z.string().min(2),
  mode: channelModeSchema,
  active: z.boolean(),
  role: channelRoleSchema,
  settings: channelSettingsSchema,
  telegramCredentialConfigured: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ChannelResponse = z.infer<typeof channelResponseSchema>;
