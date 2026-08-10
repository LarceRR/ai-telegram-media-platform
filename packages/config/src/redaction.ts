/**
 * Keys that must never reach logs, API responses or the frontend bundle.
 * Consumed by the Pino redaction config and by config diagnostics endpoints.
 */
export const SECRET_ENV_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'TELEGRAM_BOT_TOKEN',
  'OPENROUTER_API_KEY',
] as const;

export const REDACTED = '[REDACTED]';

export function isSecretKey(key: string): boolean {
  if ((SECRET_ENV_KEYS as readonly string[]).includes(key)) return true;
  return /(token|secret|password|apikey|api_key|authorization|cookie|credential)/i.test(key);
}

/** Shallow-safe redaction helper for diagnostics output. */
export function redactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, isSecretKey(key) ? REDACTED : value]),
  );
}
