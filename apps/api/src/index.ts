/**
 * Public surface of the API codebase, consumed by apps/worker.
 *
 * apps/worker is not a second service: it boots this same NestJS codebase in
 * worker mode via `createWorkerContext()` (see ADR-0001).
 *
 * Keep this list minimal. Every export drags its type dependencies into every
 * consumer, so anything the worker does not need stays internal (HealthService,
 * for example, would force the worker to resolve the S3 SDK).
 */
export { AppModule } from './app/app.module';
export { WorkerModule } from './app/worker.module';
export { createWorkerContext } from './app/worker-context';
export { APP_ENV, APP_LOGGER } from './common/config.module';
export { PrismaService } from './infrastructure/prisma/prisma.service';
export { QueueRegistry, REDIS_CONNECTION } from './infrastructure/queue/queue.registry';
export { AuditLogService, type RecordAuditInput } from './modules/system/application/audit-log.service';
