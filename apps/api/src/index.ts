export { AppModule } from './app/app.module';
export { WorkerModule } from './app/worker.module';
export { createWorkerContext } from './app/worker-context';
export { APP_ENV, APP_LOGGER } from './common/config.module';
export { PrismaService } from './infrastructure/prisma/prisma.service';
export { QueueRegistry, REDIS_CONNECTION } from './infrastructure/queue/queue.registry';
export {
  AuditLogService,
  type RecordAuditInput,
} from './modules/system/application/audit-log.service';
export { SourcesService } from './modules/sources/application/sources.service';
export { SourceAdapterRegistry } from './modules/sources/infrastructure/source-adapter.registry';
export {
  SAFE_HTTP_CLIENT,
  SOURCE_ADAPTERS,
} from './modules/sources/infrastructure/source.tokens';
export { HardenedHttpClient } from './modules/sources/infrastructure/http/hardened-http-client';
export type {
  HttpRequestOptions,
  HttpResponse,
  SafeHttpClient,
} from './modules/sources/domain/safe-http-client';
export type {
  SourceAdapter,
  SourceFetchResult,
  SourceHealthReport,
  SourceRateLimit,
} from './modules/sources/domain/source-adapter';
export { SourceIntegrationError } from './modules/sources/domain/source-errors';
