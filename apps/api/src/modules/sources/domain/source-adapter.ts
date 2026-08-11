import type { SourceHealthStatus, SourceItemPayload, SourceType } from '@atmp/contracts';

export interface SourceFetchConfig {
  readonly type: SourceType;
  readonly url: string;
}

/**
 * Declared by the adapter, honoured by the caller.
 *
 * `minIntervalMs` is not advisory: the ingestion idempotency key is bucketed by
 * that window, so repeated triggers inside one window collapse onto a single
 * job instead of hammering the upstream.
 */
export interface SourceRateLimit {
  readonly minIntervalMs: number;
  readonly maxRequestsPerFetch: number;
  readonly requestTimeoutMs: number;
  readonly maxResponseBytes: number;
}

/** A parsed candidate that failed validation. Recorded, never silently dropped. */
export interface QuarantinedSourceItem {
  readonly externalItemId: string | null;
  readonly reason: string;
}

export interface SourceFetchResult {
  readonly items: readonly SourceItemPayload[];
  readonly quarantined: readonly QuarantinedSourceItem[];
  /** Opaque cursor to persist verbatim and replay on the next fetch. */
  readonly cursor: string | null;
  readonly httpStatus: number | null;
  /** True when the upstream reported nothing new. */
  readonly notModified: boolean;
}

export interface SourceHealthReport {
  readonly status: SourceHealthStatus;
  readonly latencyMs: number;
  readonly httpStatus: number | null;
  readonly errorCategory: string | null;
  readonly errorMessage: string | null;
}

/**
 * The contract every source type implements. Adding a source type must never
 * require a change in the ingestion pipeline.
 */
export interface SourceAdapter {
  readonly type: SourceType;
  readonly rateLimit: SourceRateLimit;
  fetch(config: SourceFetchConfig, cursor?: string): Promise<SourceFetchResult>;
  /** Reports failure as data and never throws, so a probe cannot break a caller. */
  health(config: SourceFetchConfig): Promise<SourceHealthReport>;
}
