import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import {
  DEFAULT_QUEUE_POLICIES,
  QUEUE_NAMES,
  QUEUE_PREFIX,
  type QueueDepth,
  type QueueName,
} from '@atmp/contracts';
import { AppError } from '@atmp/shared';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');

/**
 * Owns the fixed queue set and enforces idempotent enqueueing: a deterministic
 * jobId means a retried or duplicated enqueue can never produce a second job.
 */
@Injectable()
export class QueueRegistry implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(@Inject(REDIS_CONNECTION) private readonly connection: Redis) {
    for (const name of QUEUE_NAMES) {
      const policy = DEFAULT_QUEUE_POLICIES[name];
      this.queues.set(
        name,
        new Queue(name, {
          connection: this.connection,
          prefix: QUEUE_PREFIX,
          defaultJobOptions: {
            attempts: policy.attempts,
            backoff: { type: 'exponential', delay: policy.backoffMs },
            removeOnComplete: { age: 86_400, count: 1_000 },
            removeOnFail: false,
          },
        }),
      );
    }
  }

  get(name: QueueName): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new AppError('INTERNAL', `Queue "${name}" is not registered`);
    }
    return queue;
  }

  /** @param idempotencyKey deterministic BullMQ job id; identical keys collapse. */
  async enqueue<TPayload extends object>(
    name: QueueName,
    jobName: string,
    payload: TPayload,
    idempotencyKey: string,
    options: JobsOptions = {},
  ): Promise<string> {
    const job = await this.get(name).add(jobName, payload, { ...options, jobId: idempotencyKey });
    return job.id ?? idempotencyKey;
  }

  async depths(): Promise<QueueDepth[]> {
    return Promise.all(
      [...this.queues.entries()].map(async ([name, queue]) => {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'failed',
          'completed',
        );
        return {
          queue: name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
        };
      }),
    );
  }

  async ping(): Promise<void> {
    await this.connection.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.queues.values()].map((queue) => queue.close()));
    await this.connection.quit().catch(() => undefined);
  }
}
