import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type { INestApplicationContext } from '@nestjs/common';
import type { AppEnv } from '@atmp/config';
import { DEFAULT_QUEUE_POLICIES, QUEUE_PREFIX, type QueueName } from '@atmp/contracts';
import { toErrorCategory, isRetryable, type Logger } from '@atmp/shared';
import { PROCESSORS, type ProcessorContext } from '../processors';

export interface WorkerRuntime {
  queueNames: QueueName[];
  stop: () => Promise<void>;
}

/**
 * Boots one BullMQ Worker per queue that has registered processors.
 * Empty queues stay defined in contracts but consume no connections yet.
 */
export async function startWorkers(options: {
  context: INestApplicationContext;
  env: AppEnv;
  logger: Logger;
}): Promise<WorkerRuntime> {
  const { context, env, logger } = options;

  // BullMQ workers need a dedicated blocking connection, separate from the API.
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  const processorContext: ProcessorContext = { context, logger };
  const workers: Worker[] = [];
  const queueNames: QueueName[] = [];

  for (const [queueName, handlers] of Object.entries(PROCESSORS) as Array<
    [QueueName, Record<string, (job: Job, ctx: ProcessorContext) => Promise<void>>]
  >) {
    if (Object.keys(handlers).length === 0) continue;

    const policy = DEFAULT_QUEUE_POLICIES[queueName];
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        const handler = handlers[job.name];
        if (!handler) {
          // Unknown job names are a contract violation, never a silent retry loop.
          logger.error(
            { queue: queueName, jobName: job.name, jobId: job.id },
            'no processor registered',
          );
          throw new Error(`No processor registered for "${queueName}:${job.name}"`);
        }
        await handler(job, processorContext);
      },
      {
        connection,
        prefix: QUEUE_PREFIX,
        concurrency: Math.min(policy.concurrency, env.WORKER_CONCURRENCY),
        autorun: true,
      },
    );

    worker.on('completed', (job) => {
      logger.info({ queue: queueName, jobName: job.name, jobId: job.id }, 'job completed');
    });

    worker.on('failed', (job, error) => {
      const category = toErrorCategory(error);
      logger.error(
        {
          queue: queueName,
          jobName: job?.name,
          jobId: job?.id,
          attempts: job?.attemptsMade,
          category,
          retryable: isRetryable(category),
          err: error,
        },
        'job failed',
      );
    });

    worker.on('error', (error) => {
      logger.error({ queue: queueName, err: error }, 'worker error');
    });

    workers.push(worker);
    queueNames.push(queueName);
  }

  return {
    queueNames,
    stop: async () => {
      // `close()` stops fetching new jobs and waits for in-flight jobs to settle.
      await Promise.allSettled(workers.map((worker) => worker.close()));
      await connection.quit().catch(() => undefined);
    },
  };
}
