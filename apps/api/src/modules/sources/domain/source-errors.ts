import { AppError, type ErrorCategory } from '@atmp/shared';

/**
 * Maps a transport status onto the shared retry classification. Callers must
 * never pattern-match provider messages to decide whether to retry.
 */
export function categoryForHttpStatus(status: number): ErrorCategory {
  if (status === 408) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_UNAVAILABLE';
  if (status === 401 || status === 403) return 'FORBIDDEN';
  if (status === 404 || status === 410) return 'NOT_FOUND';
  if (status >= 400) return 'VALIDATION';
  return 'INTERNAL';
}

/**
 * Declared as a type alias, not an interface: that gives it an implicit index
 * signature so it satisfies AppError's `details` without a cast.
 */
export type SourceIntegrationErrorDetails = {
  url?: string;
  hostname?: string;
  address?: string;
  httpStatus?: number;
  contentType?: string;
  allowedContentTypes?: readonly string[];
  bytes?: number;
  limit?: number;
  issues?: readonly string[];
};

/**
 * A typed adapter failure. `retryable` comes from the category, so the job
 * layer can decide between retry and dead-letter without knowing the adapter.
 */
export class SourceIntegrationError extends AppError {
  constructor(
    category: ErrorCategory,
    message: string,
    details?: SourceIntegrationErrorDetails,
    options?: { cause?: unknown },
  ) {
    super(category, message, details, options);
    this.name = 'SourceIntegrationError';
  }

  static fromHttpStatus(status: number, url: string): SourceIntegrationError {
    return new SourceIntegrationError(
      categoryForHttpStatus(status),
      `Source returned HTTP ${status}`,
      { httpStatus: status, url },
    );
  }
}
