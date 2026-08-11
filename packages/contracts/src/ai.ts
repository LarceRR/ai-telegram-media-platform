import { z } from 'zod';
import { jobEnvelopeSchema } from './jobs';

export const aiTaskTypeSchema = z.enum([
  'DISCOVERY',
  'STORY_CLASSIFICATION',
  'RESEARCH_DECISION',
  'RESEARCH',
  'WRITING',
  'FACT_CHECKING',
  'SCORING',
  'IMAGE_SELECTION',
  'FINAL_JUDGE',
  'OPTIMIZATION',
]);
export type AITaskType = z.infer<typeof aiTaskTypeSchema>;

export const aiRunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'FALLBACK']);
export type AIRunStatus = z.infer<typeof aiRunStatusSchema>;

export const aiErrorCategorySchema = z.enum([
  'INVALID_REQUEST',
  'INVALID_OUTPUT',
  'AUTHENTICATION',
  'RATE_LIMITED',
  'TIMEOUT',
  'UPSTREAM_UNAVAILABLE',
  'BUDGET_EXCEEDED',
  'PROVIDER_ERROR',
  'INTERNAL',
]);
export type AIErrorCategory = z.infer<typeof aiErrorCategorySchema>;

export const aiProviderSchema = z.enum(['OPENROUTER', 'FAKE']);
export type AIProviderName = z.infer<typeof aiProviderSchema>;

export const aiTaskRequestSchema = z.object({
  taskType: aiTaskTypeSchema,
  model: z.string().min(1).max(200).optional(),
  promptVersion: z.string().min(1).max(200),
  systemPrompt: z.string().max(100_000),
  userPrompt: z.string().max(500_000),
  responseSchema: z.string().min(1).max(200),
  temperature: z.number().min(0).max(2).default(0),
  maxTokens: z.number().int().positive().max(100_000).default(2_000),
  timeoutMs: z.number().int().positive().max(300_000).default(60_000),
  correlationId: z.string().uuid(),
});
export type AITaskRequest = z.infer<typeof aiTaskRequestSchema>;

export const aiUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().nullable(),
});
export type AIUsage = z.infer<typeof aiUsageSchema>;

export const aiTaskResultSchema = z.object({
  provider: aiProviderSchema,
  model: z.string().min(1),
  output: z.unknown(),
  usage: aiUsageSchema,
  latencyMs: z.number().int().nonnegative(),
  status: z.enum(['SUCCEEDED', 'FALLBACK']),
  rawOutputRef: z.string().max(500).nullable(),
});
export type AITaskResult = z.infer<typeof aiTaskResultSchema>;

export const aiRunFailureSchema = z.object({
  status: z.literal('FAILED'),
  errorCategory: aiErrorCategorySchema,
  errorMessage: z.string().max(1_000),
  retryable: z.boolean(),
});
export type AIRunFailure = z.infer<typeof aiRunFailureSchema>;

export const aiJobSchema = jobEnvelopeSchema.extend({
  taskType: aiTaskTypeSchema,
  subjectId: z.string().uuid(),
  configVersion: z.string().min(1).max(200),
});
export type AIJob = z.infer<typeof aiJobSchema>;

export const AI_CONFIG_VERSION = 'ai-v1';
export const AI_DEFAULT_TIMEOUT_MS = 60_000;
export const AI_DEFAULT_MAX_ATTEMPTS = 2;
