import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import type { Logger } from '@atmp/shared';
import { PinoLoggerService } from '../common/pino-logger.service';
import { WorkerModule } from './worker.module';

/** Boots the shared codebase without an HTTP server, for BullMQ processors. */
export async function createWorkerContext(logger: Logger): Promise<INestApplicationContext> {
  const context = await NestFactory.createApplicationContext(WorkerModule, {
    logger: new PinoLoggerService(logger),
    bufferLogs: true,
  });
  context.enableShutdownHooks();
  return context;
}
