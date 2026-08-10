/**
 * Public surface of the API codebase.
 *
 * apps/worker is not a second service: it boots this same NestJS codebase in
 * worker mode via `createWorkerContext()` (see ADR-0001).
 */
export { AppModule } from './app/app.module';
export { WorkerModule } from './app/worker.module';
export { createWorkerContext } from './app/worker-context';
export { APP_ENV } from './common/config.module';
export { PrismaService } from './infrastructure/prisma/prisma.service';
export { QueueRegistry, REDIS_CONNECTION } from './infrastructure/queue/queue.registry';
export { HealthService } from './modules/system/application/health.service';
export { AuditLogService } from './modules/system/application/audit-log.service';
