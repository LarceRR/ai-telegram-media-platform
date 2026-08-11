import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { toErrorCategory } from '@atmp/shared';
import type {
  HttpRequestOptions,
  HttpResponse,
  SafeHttpClient,
} from '../../domain/safe-http-client';
import { SourceIntegrationError, categoryForHttpStatus } from '../../domain/source-errors';

export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 5_000_000;
export const DEFAULT_MAX_REDIRECTS = 3;

const USER_AGENT = 'ATMP-ingestion/1.0';
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** Narrow structural ports so tests can inject fakes without DOM or undici types. */
export interface FetchLikeResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
export interface FetchLikeInit {
  method: string;
  redirect: 'manual';
  signal: AbortSignal;
  headers: Record<string, string>;
}
export type FetchLike = (url: string, init: FetchLikeInit) => Promise<FetchLikeResponse>;
export type DnsLookupLike = (hostname: string) => Promise<ReadonlyArray<{ address: string }>>;

export interface HardenedHttpClientDeps {
  fetch?: FetchLike;
  lookup?: DnsLookupLike;
}

function octets(ip: string): [number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const first = Number.parseInt(parts[0] ?? '', 10);
  const second = Number.parseInt(parts[1] ?? '', 10);
  if (!Number.isInteger(first) || !Number.isInteger(second)) return null;
  return [first, second];
}

/** Anything not unambiguously public routable unicast is blocked. */
function isBlockedIpv4(ip: string): boolean {
  const parsed = octets(ip);
  if (!parsed) return true;
  const [a, b] = parsed;
  if (a === 0) return true; // 0.0.0.0/8 this-network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // protocol assignments and TEST-NET-1
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const value = (ip.toLowerCase().split('%')[0] ?? '').trim();
  if (value === '' || value === '::' || value === '::1') return true;
  if (value.startsWith('fe80') || value.startsWith('fc') || value.startsWith('fd')) return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    return isIP(mapped) === 4 ? isBlockedIpv4(mapped) : true;
  }
  // 6to4, Teredo and NAT64 can all be pointed back at private space.
  if (value.startsWith('2002:') || value.startsWith('2001:0:') || value.startsWith('64:ff9b:')) {
    return true;
  }
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

export function normalizeHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/** Rejects anything we are not willing to send an outbound request to. */
export function assertSafeUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SourceIntegrationError('VALIDATION', 'Source URL is not a valid absolute URL', {
      url: value,
    });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SourceIntegrationError(
      'VALIDATION',
      `Unsupported protocol "${parsed.protocol}": only HTTP(S) sources are allowed`,
      { url: value },
    );
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new SourceIntegrationError('VALIDATION', 'Source URL credentials are not allowed', {
      url: parsed.origin,
    });
  }
  if (parsed.hostname === '') {
    throw new SourceIntegrationError('VALIDATION', 'Source URL has no hostname', { url: value });
  }
  return parsed;
}

export function assertAllowedContentType(
  value: string | null,
  allowed?: readonly string[],
): void {
  if (!allowed || allowed.length === 0) return;
  if (!value) {
    throw new SourceIntegrationError(
      'CONTRACT_VIOLATION',
      'Source response carries no content-type',
      { allowedContentTypes: allowed },
    );
  }
  const essence = (value.split(';')[0] ?? '').trim().toLowerCase();
  if (!allowed.includes(essence)) {
    throw new SourceIntegrationError(
      'CONTRACT_VIOLATION',
      `Unsupported content-type "${essence}"`,
      { contentType: essence, allowedContentTypes: allowed },
    );
  }
}

/**
 * SSRF-hardened outbound GET.
 *
 * Every hop is revalidated: protocol, credentials, IP literals and DNS results
 * are checked again after each redirect, because the first hop resolving to a
 * public address says nothing about where the next one points.
 */
export class HardenedHttpClient implements SafeHttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly lookupImpl: DnsLookupLike;

  constructor(deps: HardenedHttpClientDeps = {}) {
    this.fetchImpl = deps.fetch ?? ((url, init) => fetch(url, init));
    this.lookupImpl = deps.lookup ?? ((hostname) => lookup(hostname, { all: true }));
  }

  async get(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

    let current = assertSafeUrl(url);

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      await this.assertResolvesPublicly(current);
      const response = await this.send(current, timeoutMs, options.headers ?? {});

      if (REDIRECT_STATUSES.has(response.status)) {
        current = this.nextHop(response, current);
        continue;
      }

      const etag = response.headers.get('etag');
      const lastModified = response.headers.get('last-modified');

      if (response.status === 304) {
        return {
          url: current.toString(),
          status: 304,
          contentType: null,
          etag,
          lastModified,
          body: '',
        };
      }

      if (response.status < 200 || response.status >= 300) {
        throw SourceIntegrationError.fromHttpStatus(response.status, current.toString());
      }

      const contentType = response.headers.get('content-type');
      assertAllowedContentType(contentType, options.allowedContentTypes);

      const declared = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(declared) && declared > maxBytes) {
        throw new SourceIntegrationError('VALIDATION', 'Source declared an oversized response', {
          bytes: declared,
          limit: maxBytes,
          url: current.toString(),
        });
      }

      const body = await this.readBody(response, current);
      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        throw new SourceIntegrationError('VALIDATION', 'Source response exceeds the size limit', {
          bytes: Buffer.byteLength(body, 'utf8'),
          limit: maxBytes,
          url: current.toString(),
        });
      }

      return {
        url: current.toString(),
        status: response.status,
        contentType,
        etag,
        lastModified,
        body,
      };
    }

    throw new SourceIntegrationError(
      'UPSTREAM_UNAVAILABLE',
      `Source exceeded ${maxRedirects} redirects`,
      { url },
    );
  }

  private nextHop(response: FetchLikeResponse, current: URL): URL {
    const location = response.headers.get('location');
    if (!location) {
      throw new SourceIntegrationError(
        'CONTRACT_VIOLATION',
        `Redirect ${response.status} without a location header`,
        { url: current.toString(), httpStatus: response.status },
      );
    }
    let resolved: URL;
    try {
      resolved = new URL(location, current);
    } catch {
      throw new SourceIntegrationError('VALIDATION', 'Redirect location is not a usable URL', {
        url: current.toString(),
      });
    }
    return assertSafeUrl(resolved.toString());
  }

  private async assertResolvesPublicly(url: URL): Promise<void> {
    const hostname = normalizeHostname(url.hostname);

    if (isIP(hostname) !== 0) {
      if (isBlockedAddress(hostname)) {
        throw new SourceIntegrationError(
          'VALIDATION',
          `Source address ${hostname} is not publicly routable`,
          { hostname, address: hostname },
        );
      }
      return;
    }

    let records: ReadonlyArray<{ address: string }>;
    try {
      records = await this.lookupImpl(hostname);
    } catch (error) {
      throw new SourceIntegrationError(
        'UPSTREAM_UNAVAILABLE',
        `DNS lookup failed for ${hostname}`,
        { hostname },
        { cause: error },
      );
    }

    if (records.length === 0) {
      throw new SourceIntegrationError(
        'UPSTREAM_UNAVAILABLE',
        `DNS returned no records for ${hostname}`,
        { hostname },
      );
    }

    const blocked = records.find((record) => isBlockedAddress(record.address));
    if (blocked) {
      throw new SourceIntegrationError(
        'VALIDATION',
        `${hostname} resolves to a blocked address`,
        { hostname, address: blocked.address },
      );
    }
  }

  private async send(
    url: URL,
    timeoutMs: number,
    headers: Record<string, string>,
  ): Promise<FetchLikeResponse> {
    try {
      return await this.fetchImpl(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': USER_AGENT, accept: '*/*', ...headers },
      });
    } catch (error) {
      if (error instanceof SourceIntegrationError) throw error;
      throw new SourceIntegrationError(
        toErrorCategory(error),
        error instanceof Error ? error.message : 'Source request failed',
        { url: url.toString() },
        { cause: error },
      );
    }
  }

  private async readBody(response: FetchLikeResponse, url: URL): Promise<string> {
    try {
      return await response.text();
    } catch (error) {
      throw new SourceIntegrationError(
        toErrorCategory(error),
        'Source response body could not be read',
        { url: url.toString(), httpStatus: response.status },
        { cause: error },
      );
    }
  }
}

export { categoryForHttpStatus };
