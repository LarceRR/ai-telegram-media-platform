import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Typed, fail-fast configuration. Validated once at process startup so a
 * misconfigured deployment crashes immediately instead of failing mid-pipeline.
 */

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(15_000),

  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  API_GLOBAL_PREFIX: z.string().default('api/v1'),
  CORS_ALLOWED_ORIGINS: csv.default('http://localhost:3000'),

  DATABASE_URL: z.string().url().startsWith('postgres'),
  REDIS_URL: z.string().url().startsWith('redis'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),

  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanish.default(true),
});

export type AppEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n - ${issues.join('\n - ')}`);
    this.name = 'EnvValidationError';
  }
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: AppEnv | undefined;

/** Loads .env (development only), validates and caches the result. */
export function loadEnv(options: { reload?: boolean } = {}): AppEnv {
  if (cached && !options.reload) return cached;
  if (process.env.NODE_ENV !== 'production') {
    loadDotenv();
  }
  cached = parseEnv(process.env);
  return cached;
}

export function isStorageConfigured(env: AppEnv): boolean {
  return Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}
