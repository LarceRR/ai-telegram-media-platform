import { z } from 'zod';

export const dependencyStatusSchema = z.enum(['up', 'down', 'degraded', 'skipped']);
export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

export const dependencyCheckSchema = z.object({
  name: z.string(),
  status: dependencyStatusSchema,
  latencyMs: z.number().nonnegative().optional(),
  detail: z.string().optional(),
});
export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;

export const livenessSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});
export type Liveness = z.infer<typeof livenessSchema>;

export const readinessSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  service: z.string(),
  version: z.string(),
  timestamp: z.string().datetime(),
  correlationId: z.string(),
  checks: z.array(dependencyCheckSchema),
});
export type Readiness = z.infer<typeof readinessSchema>;

export const queueDepthSchema = z.object({
  queue: z.string(),
  waiting: z.number().nonnegative(),
  active: z.number().nonnegative(),
  delayed: z.number().nonnegative(),
  failed: z.number().nonnegative(),
  completed: z.number().nonnegative(),
});
export type QueueDepth = z.infer<typeof queueDepthSchema>;

export const systemMetricsSchema = z.object({
  service: z.string(),
  timestamp: z.string().datetime(),
  queues: z.array(queueDepthSchema),
  process: z.object({
    uptimeSeconds: z.number().nonnegative(),
    heapUsedMb: z.number().nonnegative(),
    rssMb: z.number().nonnegative(),
  }),
});
export type SystemMetrics = z.infer<typeof systemMetricsSchema>;
