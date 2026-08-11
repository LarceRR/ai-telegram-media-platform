import {
  DEFAULT_MAX_REDIRECTS,
  HardenedHttpClient,
  assertSafeUrl,
  isBlockedAddress,
  normalizeHostname,
  type DnsLookupLike,
  type FetchLike,
  type FetchLikeResponse,
} from './hardened-http-client';
import { SourceIntegrationError } from '../../domain/source-errors';

function reply(init: {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
}): FetchLikeResponse {
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    status: init.status ?? 200,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    text: async () => init.body ?? '',
  };
}

const PUBLIC_ADDRESS = '93.184.216.34';
const publicDns: DnsLookupLike = async () => [{ address: PUBLIC_ADDRESS }];

function client(fetchImpl: FetchLike, lookupImpl: DnsLookupLike = publicDns): HardenedHttpClient {
  return new HardenedHttpClient({ fetch: fetchImpl, lookup: lookupImpl });
}

describe('SSRF address policy', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '100.64.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '2002:c0a8:0101::1',
    '64:ff9b::7f00:1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([PUBLIC_ADDRESS, '8.8.8.8', '172.32.0.1', '2606:4700::1111'])(
    'allows %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  it('unwraps bracketed IPv6 hostnames before classifying them', () => {
    expect(normalizeHostname('[::1]')).toBe('::1');
    expect(normalizeHostname('example.com')).toBe('example.com');
  });
});

describe('URL policy', () => {
  it.each(['file:///etc/passwd', 'ftp://example.com/feed', 'javascript:alert(1)', 'not a url'])(
    'rejects %s',
    (url) => {
      expect(() => assertSafeUrl(url)).toThrow(SourceIntegrationError);
    },
  );

  it('rejects embedded credentials without leaking them', () => {
    let thrown: unknown;
    try {
      assertSafeUrl('https://user:secret@example.com/feed');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SourceIntegrationError);
    expect(JSON.stringify(thrown instanceof SourceIntegrationError ? thrown.details : {})).not.toContain(
      'secret',
    );
  });

  it('accepts plain HTTP and HTTPS', () => {
    expect(assertSafeUrl('https://example.com/feed.xml').hostname).toBe('example.com');
    expect(assertSafeUrl('http://example.com/feed.xml').protocol).toBe('http:');
  });
});

describe('HardenedHttpClient outbound policy', () => {
  it('never sends a request when the hostname is a private IP literal', async () => {
    const fetchImpl = jest.fn<Promise<FetchLikeResponse>, [string, unknown]>();
    await expect(
      client(fetchImpl as unknown as FetchLike).get('http://127.0.0.1/feed'),
    ).rejects.toMatchObject({ category: 'VALIDATION' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never sends a request when DNS resolves to a private address', async () => {
    const fetchImpl = jest.fn<Promise<FetchLikeResponse>, [string, unknown]>();
    const privateDns: DnsLookupLike = async () => [{ address: '169.254.169.254' }];
    await expect(
      client(fetchImpl as unknown as FetchLike, privateDns).get('http://metadata.test/feed'),
    ).rejects.toMatchObject({ category: 'VALIDATION' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks a split-horizon result where only one record is private', async () => {
    const fetchImpl = jest.fn<Promise<FetchLikeResponse>, [string, unknown]>();
    const mixedDns: DnsLookupLike = async () => [
      { address: PUBLIC_ADDRESS },
      { address: '10.0.0.5' },
    ];
    await expect(
      client(fetchImpl as unknown as FetchLike, mixedDns).get('http://mixed.test/feed'),
    ).rejects.toMatchObject({ category: 'VALIDATION' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('revalidates DNS on every redirect hop', async () => {
    const lookups: string[] = [];
    const lookupImpl: DnsLookupLike = async (hostname) => {
      lookups.push(hostname);
      return hostname === 'internal.test'
        ? [{ address: '10.0.0.9' }]
        : [{ address: PUBLIC_ADDRESS }];
    };
    const fetchImpl: FetchLike = async () =>
      reply({ status: 302, headers: { location: 'http://internal.test/secret' } });

    await expect(
      client(fetchImpl, lookupImpl).get('https://public.test/feed'),
    ).rejects.toMatchObject({ category: 'VALIDATION' });
    expect(lookups).toEqual(['public.test', 'internal.test']);
  });

  it('rejects a redirect that leaves HTTP(S)', async () => {
    const fetchImpl: FetchLike = async () =>
      reply({ status: 301, headers: { location: 'file:///etc/passwd' } });
    await expect(client(fetchImpl).get('https://public.test/feed')).rejects.toMatchObject({
      category: 'VALIDATION',
    });
  });

  it('treats a redirect without a location header as a contract violation', async () => {
    const fetchImpl: FetchLike = async () => reply({ status: 302 });
    await expect(client(fetchImpl).get('https://public.test/feed')).rejects.toMatchObject({
      category: 'CONTRACT_VIOLATION',
    });
  });

  it('gives up after the redirect budget', async () => {
    const fetchImpl = jest.fn<Promise<FetchLikeResponse>, [string, FetchLikeInitLike]>(async () =>
      reply({ status: 307, headers: { location: 'https://public.test/next' } }),
    );
    await expect(
      client(fetchImpl as unknown as FetchLike).get('https://public.test/feed'),
    ).rejects.toMatchObject({ category: 'UPSTREAM_UNAVAILABLE' });
    expect(fetchImpl).toHaveBeenCalledTimes(DEFAULT_MAX_REDIRECTS + 1);
  });

  it('rejects an oversized declared content-length before reading the body', async () => {
    const text = jest.fn(async () => 'x');
    const fetchImpl: FetchLike = async () => ({
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? '9000' : null) },
      text,
    });
    await expect(
      client(fetchImpl).get('https://public.test/feed', { maxResponseBytes: 1_000 }),
    ).rejects.toMatchObject({ category: 'VALIDATION' });
    expect(text).not.toHaveBeenCalled();
  });

  it('rejects a body that lies about its size', async () => {
    const fetchImpl: FetchLike = async () => reply({ body: 'y'.repeat(2_000) });
    await expect(
      client(fetchImpl).get('https://public.test/feed', { maxResponseBytes: 1_000 }),
    ).rejects.toMatchObject({ category: 'VALIDATION' });
  });

  it('rejects a content-type the caller cannot parse', async () => {
    const fetchImpl: FetchLike = async () =>
      reply({ headers: { 'content-type': 'application/octet-stream' }, body: 'binary' });
    await expect(
      client(fetchImpl).get('https://public.test/feed', {
        allowedContentTypes: ['application/rss+xml'],
      }),
    ).rejects.toMatchObject({ category: 'CONTRACT_VIOLATION' });
  });

  it('accepts an allowed content-type with parameters', async () => {
    const fetchImpl: FetchLike = async () =>
      reply({ headers: { 'content-type': 'Application/RSS+XML; charset=utf-8' }, body: '<rss/>' });
    const response = await client(fetchImpl).get('https://public.test/feed', {
      allowedContentTypes: ['application/rss+xml'],
    });
    expect(response.body).toBe('<rss/>');
  });

  it('returns 304 with an empty body and preserves validators', async () => {
    const fetchImpl: FetchLike = async () =>
      reply({ status: 304, headers: { etag: 'W/"abc"', 'last-modified': 'Mon, 10 Aug 2026 10:00:00 GMT' } });
    const response = await client(fetchImpl).get('https://public.test/feed', {
      allowedContentTypes: ['application/rss+xml'],
    });
    expect(response.status).toBe(304);
    expect(response.body).toBe('');
    expect(response.etag).toBe('W/"abc"');
    expect(response.lastModified).toBe('Mon, 10 Aug 2026 10:00:00 GMT');
  });

  it.each([
    [429, 'RATE_LIMITED', true],
    [503, 'UPSTREAM_UNAVAILABLE', true],
    [408, 'TIMEOUT', true],
    [403, 'FORBIDDEN', false],
    [404, 'NOT_FOUND', false],
    [400, 'VALIDATION', false],
  ])('maps HTTP %s to %s', async (status, category, retryable) => {
    const fetchImpl: FetchLike = async () => reply({ status: status as number });
    let thrown: unknown;
    try {
      await client(fetchImpl).get('https://public.test/feed');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SourceIntegrationError);
    if (thrown instanceof SourceIntegrationError) {
      expect(thrown.category).toBe(category);
      expect(thrown.retryable).toBe(retryable);
    }
  });

  it('classifies an aborted request as a retryable timeout', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('The operation was aborted due to timeout');
    };
    let thrown: unknown;
    try {
      await client(fetchImpl).get('https://public.test/feed');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SourceIntegrationError);
    if (thrown instanceof SourceIntegrationError) {
      expect(thrown.category).toBe('TIMEOUT');
      expect(thrown.retryable).toBe(true);
    }
  });

  it('reports the final URL after following redirects', async () => {
    let call = 0;
    const fetchImpl: FetchLike = async () => {
      call += 1;
      return call === 1
        ? reply({ status: 308, headers: { location: 'https://public.test/final' } })
        : reply({ headers: { 'content-type': 'text/html' }, body: '<html></html>' });
    };
    const response = await client(fetchImpl).get('https://public.test/feed');
    expect(response.url).toBe('https://public.test/final');
    expect(response.contentType).toBe('text/html');
  });

  it('sends a bounded, non-following request with a stable user agent', async () => {
    const seen: FetchLikeInitLike[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      seen.push(init as FetchLikeInitLike);
      return reply({ body: 'ok' });
    };
    await client(fetchImpl).get('https://public.test/feed', {
      headers: { 'if-none-match': 'W/"1"' },
    });
    const init = seen[0];
    expect(init?.redirect).toBe('manual');
    expect(init?.headers['user-agent']).toContain('ATMP-ingestion');
    expect(init?.headers['if-none-match']).toBe('W/"1"');
    expect(init?.signal.aborted).toBe(false);
  });
});

interface FetchLikeInitLike {
  redirect: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}
