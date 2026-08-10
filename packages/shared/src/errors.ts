/** Retry classification shared by AI calls, source adapters, jobs and publishing. */
export type ErrorCategory =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'CONTRACT_VIOLATION'
  | 'INTERNAL';

const RETRYABLE: ReadonlySet<ErrorCategory> = new Set<ErrorCategory>([
  'RATE_LIMITED',
  'TIMEOUT',
  'UPSTREAM_UNAVAILABLE',
]);

export class AppError extends Error {
  constructor(
    public readonly category: ErrorCategory,
    message: string,
    public readonly details?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(message, options as ErrorOptions);
    this.name = 'AppError';
  }

  get retryable(): boolean {
    return isRetryable(this.category);
  }
}

export function isRetryable(category: ErrorCategory): boolean {
  return RETRYABLE.has(category);
}

export function toErrorCategory(error: unknown): ErrorCategory {
  if (error instanceof AppError) return error.category;
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|etimedout|timed out/i.test(message)) return 'TIMEOUT';
  if (/econnrefused|enotfound|socket hang up|unavailable/i.test(message)) {
    return 'UPSTREAM_UNAVAILABLE';
  }
  if (/rate limit|429|too many requests/i.test(message)) return 'RATE_LIMITED';
  return 'INTERNAL';
}
