import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newCorrelationId(): string {
  return randomUUID();
}

/**
 * Accepts an inbound correlation ID only if it is a well-formed UUID, so callers
 * cannot inject arbitrary strings into logs. Otherwise a fresh ID is issued.
 */
export function resolveCorrelationId(candidate?: string | string[] | null): string {
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  return value && UUID_RE.test(value) ? value.toLowerCase() : newCorrelationId();
}
