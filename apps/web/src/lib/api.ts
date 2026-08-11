import type { ZodType } from 'zod';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
export const API_ACTOR = process.env.NEXT_PUBLIC_API_ACTOR ?? 'local-admin@example.com';

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const isBodyRequest = init.method !== undefined && init.method !== 'GET' && init.method !== 'HEAD';
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(isBodyRequest ? { 'content-type': 'application/json' } : {}),
      'x-user-id': API_ACTOR,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Request to ${path} failed with status ${response.status}`);
  return response.status === 204 ? null : response.json();
}

export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  return schema.parse(await request(path));
}

export async function apiMutate<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  return schema.parse(await request(path, { method, body: JSON.stringify(body) }));
}
