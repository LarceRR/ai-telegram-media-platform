import type { Logger } from 'pino';

export type ShutdownTask = () => Promise<void> | void;

/**
 * Graceful shutdown: stop accepting work, drain in-flight work, then exit.
 * Bounded by a timeout so a stuck dependency cannot block termination forever.
 */
export function registerGracefulShutdown(options: {
  logger: Logger;
  timeoutMs: number;
  tasks: ShutdownTask[];
  signals?: NodeJS.Signals[];
}): void {
  const { logger, timeoutMs, tasks, signals = ['SIGTERM', 'SIGINT'] } = options;
  let shuttingDown = false;

  const shutdown = async (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, 'graceful shutdown started');

    const timer = setTimeout(() => {
      logger.error({ reason, timeoutMs }, 'graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs);
    timer.unref();

    try {
      for (const task of tasks) {
        await task();
      }
      clearTimeout(timer);
      logger.info({ reason }, 'graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      clearTimeout(timer);
      logger.error({ reason, err: error }, 'graceful shutdown failed');
      process.exit(1);
    }
  };

  for (const signal of signals) {
    process.on(signal, () => void shutdown(signal));
  }

  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'unhandled rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    void shutdown('uncaughtException');
  });
}
