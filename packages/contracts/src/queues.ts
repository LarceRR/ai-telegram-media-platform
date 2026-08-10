/**
 * A deliberately small, stable set of queues. One queue per pipeline concern,
 * never one queue per function (see ADR-0003).
 */
export const QUEUE_NAMES = [
  'ingestion',
  'content-intelligence',
  'research',
  'generation-validation',
  'media',
  'publishing',
  'analytics',
  'optimization',
  'maintenance',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export const QUEUE_PREFIX = 'atmp';

export interface QueuePolicy {
  concurrency: number;
  attempts: number;
  backoffMs: number;
  timeoutMs: number;
}

/** Defaults; per-deployment overrides come from typed config, not from code. */
export const DEFAULT_QUEUE_POLICIES: Record<QueueName, QueuePolicy> = {
  ingestion: { concurrency: 5, attempts: 5, backoffMs: 2_000, timeoutMs: 60_000 },
  'content-intelligence': { concurrency: 4, attempts: 4, backoffMs: 3_000, timeoutMs: 120_000 },
  research: { concurrency: 2, attempts: 3, backoffMs: 5_000, timeoutMs: 300_000 },
  'generation-validation': { concurrency: 2, attempts: 3, backoffMs: 5_000, timeoutMs: 300_000 },
  media: { concurrency: 4, attempts: 4, backoffMs: 2_000, timeoutMs: 120_000 },
  publishing: { concurrency: 1, attempts: 5, backoffMs: 5_000, timeoutMs: 60_000 },
  analytics: { concurrency: 3, attempts: 4, backoffMs: 3_000, timeoutMs: 60_000 },
  optimization: { concurrency: 1, attempts: 2, backoffMs: 10_000, timeoutMs: 120_000 },
  maintenance: { concurrency: 2, attempts: 2, backoffMs: 5_000, timeoutMs: 30_000 },
};
