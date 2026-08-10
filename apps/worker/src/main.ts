import 'reflect-metadata';
import { loadEnv } from '@atmp/config';
import { createLogger, registerGracefulShutdown } from '@atmp/shared';
import { createWorkerContext } from '@atmp/api';
import { startWorkers } from './runtime/worker-runtime';

/**
 * Worker process entrypoint. Same codebase as the API, different entrypoint:
 * no HTTP server, only BullMQ processors resolved from the Nest context.
 */
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({
    service: 'worker',
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV === 'development',
  });

  const context = await createWorkerContext(logger);
  const runtime = await startWorkers({ context, env, logger });

  registerGracefulShutdown({
    logger,
    timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    // Order matters: stop accepting jobs, drain in-flight work, then release deps.
    tasks: [async () => runtime.stop(), async () => context.close()],
  });

  logger.info({ queues: runtime.queueNames }, 'worker process ready');
}

void bootstrap();
