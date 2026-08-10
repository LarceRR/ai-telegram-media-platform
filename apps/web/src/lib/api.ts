import type { ZodType } from 'zod';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

/** Every response is schema-validated: the API is untrusted input for the UI too. */
export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }

  return schema.parse(await response.json());
}
