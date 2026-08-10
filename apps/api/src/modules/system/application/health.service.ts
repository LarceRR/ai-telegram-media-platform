import { Inject, Injectable } from '@nestjs/common';
import type { AppEnv } from '@atmp/config';
import type { DependencyCheck, Liveness, Readiness, SystemMetrics } from '@atmp/contracts';
import { newCorrelationId } from '@atmp/shared';
import { APP_ENV } from '../../../common/config.module';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { QueueRegistry } from '../../../infrastructure/queue/queue.registry';
import { ObjectStorageService } from '../../../infrastructure/storage/object-storage.service';

export const SERVICE_VERSION = '0.0.0-m0';

@Injectable()
export class HealthService {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly prisma: PrismaService,
    private readonly queues: QueueRegistry,
    private readonly storage: ObjectStorageService,
  ) {}

  /** Liveness answers "is the process alive", never "are dependencies healthy". */
  liveness(service = 'api'): Liveness {
    return {
      status: 'ok',
      service,
      version: SERVICE_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(correlationId = newCorrelationId(), service = 'api'): Promise<Readiness> {
    const checks = await Promise.all([
      this.check('postgres', () => this.prisma.ping()),
      this.check('pgvector', async () => {
        const installed = await this.prisma.hasVectorExtension();
        if (!installed) throw new Error('vector extension is not installed');
      }),
      this.check('redis', () => this.queues.ping()),
      this.storage.configured
        ? this.check('object-storage', () => this.storage.headBucket())
        : Promise.resolve<DependencyCheck>({
            name: 'object-storage',
            status: 'skipped',
            detail: 'storage credentials not configured',
          }),
    ]);

    const hasDown = checks.some((check) => check.status === 'down');
    const hasSkipped = checks.some((check) => check.status === 'skipped');

    return {
      status: hasDown ? 'error' : hasSkipped ? 'degraded' : 'ok',
      service,
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString(),
      correlationId,
      checks,
    };
  }

  async metrics(service = 'api'): Promise<SystemMetrics> {
    const memory = process.memoryUsage();
    return {
      service,
      timestamp: new Date().toISOString(),
      queues: await this.queues.depths(),
      process: {
        uptimeSeconds: Math.round(process.uptime()),
        heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
        rssMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      },
    };
  }

  /** Non-secret configuration snapshot for operational diagnostics. */
  configSnapshot(): Record<string, unknown> {
    return {
      nodeEnv: this.env.NODE_ENV,
      logLevel: this.env.LOG_LEVEL,
      apiPrefix: this.env.API_GLOBAL_PREFIX,
      corsAllowedOrigins: this.env.CORS_ALLOWED_ORIGINS,
      workerConcurrency: this.env.WORKER_CONCURRENCY,
      shutdownTimeoutMs: this.env.SHUTDOWN_TIMEOUT_MS,
      objectStorageConfigured: this.storage.configured,
    };
  }

  private async check(name: string, probe: () => Promise<void>): Promise<DependencyCheck> {
    const startedAt = Date.now();
    try {
      await probe();
      return { name, status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        name,
        status: 'down',
        latencyMs: Date.now() - startedAt,
        detail: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }
}
