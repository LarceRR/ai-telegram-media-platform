import { AppError, toErrorCategory } from '@atmp/shared';
import type { SourceFetchResult, SourceHealthReport } from '../../domain/source-adapter';

export function httpStatusFromError(error: unknown): number | null {
  if (!(error instanceof AppError)) return null;
  const status = error.details?.['httpStatus'];
  return typeof status === 'number' ? status : null;
}

/**
 * Shared health probe. A probe reports failure as data: callers use it to
 * decide what to show an operator, not to control flow with exceptions.
 */
export async function probeSourceHealth(
  fetchOnce: () => Promise<SourceFetchResult>,
): Promise<SourceHealthReport> {
  const started = Date.now();
  try {
    const result = await fetchOnce();
    return {
      status: result.quarantined.length > 0 ? 'DEGRADED' : 'HEALTHY',
      latencyMs: Date.now() - started,
      httpStatus: result.httpStatus,
      errorCategory: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      status: 'FAILED',
      latencyMs: Date.now() - started,
      httpStatus: httpStatusFromError(error),
      errorCategory: toErrorCategory(error),
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
    };
  }
}
