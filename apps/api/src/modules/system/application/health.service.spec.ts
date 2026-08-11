import { readinessSchema, systemMetricsSchema } from '@atmp/contracts';
import { HealthService } from './health.service';
import type { AppEnv } from '@atmp/config';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { QueueRegistry } from '../../../infrastructure/queue/queue.registry';
import type { ObjectStorageService } from '../../../infrastructure/storage/object-storage.service';

const env = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'info',
  API_GLOBAL_PREFIX: 'api/v1',
  CORS_ALLOWED_ORIGINS: ['http://localhost:3000'],
  WORKER_CONCURRENCY: 5,
  SHUTDOWN_TIMEOUT_MS: 15000,
} as unknown as AppEnv;

function build(
  overrides: {
    ping?: () => Promise<void>;
    hasVector?: () => Promise<boolean>;
    redisPing?: () => Promise<void>;
    storageConfigured?: boolean;
    headBucket?: () => Promise<void>;
  } = {},
) {
  const prisma = {
    ping: overrides.ping ?? (async () => undefined),
    hasVectorExtension: overrides.hasVector ?? (async () => true),
  } as unknown as PrismaService;

  const queues = {
    ping: overrides.redisPing ?? (async () => undefined),
    depths: async () => [
      { queue: 'ingestion', waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
    ],
  } as unknown as QueueRegistry;

  const storage = {
    configured: overrides.storageConfigured ?? true,
    headBucket: overrides.headBucket ?? (async () => undefined),
  } as unknown as ObjectStorageService;

  return new HealthService(env, prisma, queues, storage);
}

describe('HealthService', () => {
  it('reports liveness without touching dependencies', () => {
    expect(build().liveness().status).toBe('ok');
  });

  it('reports ok when every dependency is up', async () => {
    const readiness = await build().readiness('11111111-1111-4111-8111-111111111111');

    expect(() => readinessSchema.parse(readiness)).not.toThrow();
    expect(readiness.status).toBe('ok');
    expect(readiness.checks.map((check) => check.name)).toEqual([
      'postgres',
      'pgvector',
      'redis',
      'object-storage',
    ]);
  });

  it('reports error when postgres is unreachable', async () => {
    const readiness = await build({
      ping: async () => {
        throw new Error('connection refused');
      },
    }).readiness();

    expect(readiness.status).toBe('error');
    expect(readiness.checks.find((check) => check.name === 'postgres')?.status).toBe('down');
  });

  it('fails readiness when pgvector is missing', async () => {
    const readiness = await build({ hasVector: async () => false }).readiness();

    expect(readiness.status).toBe('error');
    expect(readiness.checks.find((check) => check.name === 'pgvector')?.detail).toContain('vector');
  });

  it('degrades instead of failing when storage is not configured', async () => {
    const readiness = await build({ storageConfigured: false }).readiness();

    expect(readiness.status).toBe('degraded');
    expect(readiness.checks.find((check) => check.name === 'object-storage')?.status).toBe(
      'skipped',
    );
  });

  it('exposes queue depths and never leaks secrets in the config snapshot', async () => {
    const service = build();
    const metrics = await service.metrics();

    expect(() => systemMetricsSchema.parse(metrics)).not.toThrow();
    expect(JSON.stringify(service.configSnapshot())).not.toMatch(/postgres|redis:\/\/|secret/i);
  });
});
