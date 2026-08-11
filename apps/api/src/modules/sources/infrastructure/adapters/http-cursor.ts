import { httpSourceCursorSchema, type HttpSourceCursor } from '@atmp/contracts';

/** Matches the job contract's cursor bound. */
const MAX_CURSOR_LENGTH = 2_000;

/**
 * A stored cursor is untrusted input like any other: it may predate a schema
 * change or have been written by an older adapter. An unreadable cursor is not
 * an error, it just means the next fetch starts from scratch.
 */
export function decodeCursor(value: string | undefined): HttpSourceCursor | undefined {
  if (value === undefined || value === '') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  const result = httpSourceCursorSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

export function encodeCursor(cursor: HttpSourceCursor): string | null {
  const encoded = JSON.stringify(cursor);
  return encoded.length > MAX_CURSOR_LENGTH ? null : encoded;
}

export function conditionalHeaders(cursor: HttpSourceCursor | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (cursor?.etag !== undefined) headers['if-none-match'] = cursor.etag;
  if (cursor?.lastModified !== undefined) headers['if-modified-since'] = cursor.lastModified;
  return headers;
}
