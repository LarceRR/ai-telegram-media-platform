import pino, { type Logger, type LoggerOptions } from 'pino';

/** Log paths scrubbed before anything is written. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.secret',
  'config.DATABASE_URL',
  'config.REDIS_URL',
  'config.S3_SECRET_ACCESS_KEY',
  'telegram.botToken',
  'openrouter.apiKey',
];

export interface CreateLoggerOptions {
  service: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger({
  service,
  level = 'info',
  pretty = false,
}: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    level,
    base: { service, pid: process.pid },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (pretty) {
    // pino-pretty is a dev-only transport; absence must never break startup.
    try {
      return pino({
        ...options,
        transport: { target: 'pino-pretty', options: { colorize: true, singleLine: false } },
      });
    } catch {
      return pino(options);
    }
  }

  return pino(options);
}

export type { Logger };
