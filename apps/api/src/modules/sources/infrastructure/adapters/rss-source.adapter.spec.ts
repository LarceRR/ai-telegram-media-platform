import type { HttpRequestOptions, HttpResponse, SafeHttpClient } from '../../domain/safe-http-client';
import { SourceIntegrationError } from '../../domain/source-errors';
import { RssSourceAdapter } from './rss-source.adapter';
import { ATOM_FEED, EMPTY_FEED, FEED_URL, PARTIALLY_BROKEN_FEED, RSS_2_FEED } from './feed.fixtures';

interface Call {
  url: string;
  options?: HttpRequestOptions;
}

class FakeHttp implements SafeHttpClient {
  readonly calls: Call[] = [];

  constructor(
    private readonly handler: (call: Call) => HttpResponse | Promise<HttpResponse>,
  ) {}

  async get(url: string, options?: HttpRequestOptions): Promise<HttpResponse> {
    const call: Call = { url, options };
    this.calls.push(call);
    return this.handler(call);
  }
}

function ok(body: string, extra: Partial<HttpResponse> = {}): HttpResponse {
  return {
    url: FEED_URL,
    status: 200,
    contentType: 'application/rss+xml',
    etag: null,
    lastModified: null,
    body,
    ...extra,
  };
}

const config = { type: 'RSS' as const, url: FEED_URL };

describe('RssSourceAdapter contract', () => {
  it('declares its type and rate-limit metadata', () => {
    const adapter = new RssSourceAdapter(new FakeHttp(() => ok(RSS_2_FEED)));
    expect(adapter.type).toBe('RSS');
    expect(adapter.rateLimit.minIntervalMs).toBeGreaterThan(0);
    expect(adapter.rateLimit.maxResponseBytes).toBe(5_000_000);
  });

  it('asks the transport only for parseable content types', async () => {
    const http = new FakeHttp(() => ok(RSS_2_FEED));
    await new RssSourceAdapter(http).fetch(config);
    const allowed = http.calls[0]?.options?.allowedContentTypes ?? [];
    expect(allowed).toContain('application/rss+xml');
    expect(allowed).not.toContain('application/octet-stream');
  });

  it('normalizes an RSS 2.0 feed', async () => {
    const result = await new RssSourceAdapter(new FakeHttp(() => ok(RSS_2_FEED))).fetch(config);

    expect(result.notModified).toBe(false);
    expect(result.quarantined).toEqual([]);
    expect(result.items).toHaveLength(2);

    const first = result.items[0];
    expect(first?.externalItemId).toBe('post-1');
    expect(first?.canonicalUrl).toBe('https://feed.test/posts/1');
    expect(first?.title).toBe('First & foremost');
    expect(first?.author).toBe('Ada Lovelace');
    expect(first?.publishedAt).toBe('2026-08-10T09:00:00.000Z');
    expect(first?.text).toBe('Summary with markup and');
    expect(first?.text).not.toContain('steal');
  });

  it('resolves relative links and prefers content:encoded over description', async () => {
    const result = await new RssSourceAdapter(new FakeHttp(() => ok(RSS_2_FEED))).fetch(config);
    const second = result.items[1];
    expect(second?.canonicalUrl).toBe('https://feed.test/posts/2');
    expect(second?.externalItemId).toBe('https://feed.test/posts/2');
    expect(second?.text).toBe('Richer body');
  });

  it('extracts images from enclosure, media:* and inline markup, skipping non-images', async () => {
    const result = await new RssSourceAdapter(new FakeHttp(() => ok(RSS_2_FEED))).fetch(config);
    const urls = (result.items[0]?.images ?? []).map((image) => image.url);

    expect(urls).toEqual([
      'https://cdn.feed.test/one.jpg',
      'https://cdn.feed.test/thumb.jpg',
      'https://feed.test/img/one.png',
    ]);
    expect(urls).not.toContain('https://cdn.feed.test/audio.mp3');
    expect(result.items[0]?.images[2]?.alt).toBe('One');
  });

  it('parses Atom entries, choosing the alternate link and the author name', async () => {
    const result = await new RssSourceAdapter(new FakeHttp(() => ok(ATOM_FEED))).fetch(config);
    const entry = result.items[0];

    expect(result.items).toHaveLength(1);
    expect(entry?.externalItemId).toBe('urn:uuid:9f1c');
    expect(entry?.canonicalUrl).toBe('https://atom.test/entry/1');
    expect(entry?.author).toBe('Grace Hopper');
    expect(entry?.publishedAt).toBe('2026-08-10T12:00:00.000Z');
    expect(entry?.text).toBe('Escaped & summary');
  });

  it('replays validators as a conditional request on the next fetch', async () => {
    const http = new FakeHttp(() =>
      ok(RSS_2_FEED, { etag: 'W/"v1"', lastModified: 'Mon, 10 Aug 2026 09:00:00 GMT' }),
    );
    const adapter = new RssSourceAdapter(http);

    const first = await adapter.fetch(config);
    expect(first.cursor).not.toBeNull();

    await adapter.fetch(config, first.cursor ?? undefined);
    expect(http.calls[1]?.options?.headers).toEqual({
      'if-none-match': 'W/"v1"',
      'if-modified-since': 'Mon, 10 Aug 2026 09:00:00 GMT',
    });
  });

  it('reports 304 as not modified and keeps the cursor', async () => {
    const stored = JSON.stringify({ v: 1, etag: 'W/"v1"' });
    const http = new FakeHttp(() =>
      ok('', { status: 304, contentType: null, etag: 'W/"v1"' }),
    );
    const result = await new RssSourceAdapter(http).fetch(config, stored);

    expect(result.notModified).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.cursor).toBe(stored);
  });

  it('skips entries at or before the stored watermark', async () => {
    const adapter = new RssSourceAdapter(new FakeHttp(() => ok(RSS_2_FEED)));
    const stored = JSON.stringify({ v: 1, newestPublishedAt: '2026-08-10T09:00:00.000Z' });

    const result = await adapter.fetch(config, stored);
    expect(result.items.map((item) => item.externalItemId)).toEqual([
      'https://feed.test/posts/2',
    ]);
  });

  it('advances the watermark to the newest entry it saw', async () => {
    const adapter = new RssSourceAdapter(new FakeHttp(() => ok(RSS_2_FEED)));
    const result = await adapter.fetch(config);
    expect(result.cursor).toContain('2026-08-11T09:00:00.000Z');
  });

  it('returns nothing new when the feed has not moved', async () => {
    const adapter = new RssSourceAdapter(new FakeHttp(() => ok(RSS_2_FEED)));
    const first = await adapter.fetch(config);
    const second = await adapter.fetch(config, first.cursor ?? undefined);

    expect(first.items).toHaveLength(2);
    expect(second.items).toEqual([]);
  });

  it('ignores an unreadable stored cursor instead of failing', async () => {
    const adapter = new RssSourceAdapter(new FakeHttp(() => ok(RSS_2_FEED)));
    const result = await adapter.fetch(config, '{not json');
    expect(result.items).toHaveLength(2);
  });

  it('quarantines an unusable entry and still returns the usable one', async () => {
    const result = await new RssSourceAdapter(new FakeHttp(() => ok(PARTIALLY_BROKEN_FEED))).fetch(
      config,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.canonicalUrl).toBe('https://feed.test/posts/ok');
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0]?.reason).toContain('no usable HTTP(S) link');
  });

  it('treats a feed without entries as a non-retryable contract violation', async () => {
    const adapter = new RssSourceAdapter(new FakeHttp(() => ok(EMPTY_FEED)));
    let thrown: unknown;
    try {
      await adapter.fetch(config);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SourceIntegrationError);
    if (thrown instanceof SourceIntegrationError) {
      expect(thrown.category).toBe('CONTRACT_VIOLATION');
      expect(thrown.retryable).toBe(false);
    }
  });

  it('reports health as data', async () => {
    const healthy = await new RssSourceAdapter(new FakeHttp(() => ok(RSS_2_FEED))).health(config);
    expect(healthy.status).toBe('HEALTHY');
    expect(healthy.httpStatus).toBe(200);
    expect(healthy.errorCategory).toBeNull();

    const degraded = await new RssSourceAdapter(
      new FakeHttp(() => ok(PARTIALLY_BROKEN_FEED)),
    ).health(config);
    expect(degraded.status).toBe('DEGRADED');

    const failing = await new RssSourceAdapter(
      new FakeHttp(() => {
        throw new SourceIntegrationError('UPSTREAM_UNAVAILABLE', 'Source returned HTTP 503', {
          httpStatus: 503,
        });
      }),
    ).health(config);
    expect(failing.status).toBe('FAILED');
    expect(failing.errorCategory).toBe('UPSTREAM_UNAVAILABLE');
    expect(failing.httpStatus).toBe(503);
  });
});
