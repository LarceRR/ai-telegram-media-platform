import type { HttpRequestOptions, HttpResponse, SafeHttpClient } from '../../domain/safe-http-client';
import { SourceIntegrationError } from '../../domain/source-errors';
import { WebSourceAdapter } from './web-source.adapter';
import {
  HTML_PAGE,
  HTML_PAGE_BLANK,
  HTML_PAGE_HOSTILE_CANONICAL,
  PAGE_URL,
} from './feed.fixtures';

class FakeHttp implements SafeHttpClient {
  readonly calls: Array<{ url: string; options?: HttpRequestOptions }> = [];

  constructor(private readonly handler: () => HttpResponse) {}

  async get(url: string, options?: HttpRequestOptions): Promise<HttpResponse> {
    this.calls.push({ url, options });
    return this.handler();
  }
}

function page(body: string, extra: Partial<HttpResponse> = {}): HttpResponse {
  return {
    url: PAGE_URL,
    status: 200,
    contentType: 'text/html',
    etag: null,
    lastModified: null,
    body,
    ...extra,
  };
}

const config = { type: 'WEB' as const, url: PAGE_URL };

describe('WebSourceAdapter contract', () => {
  it('accepts only HTML content types', async () => {
    const http = new FakeHttp(() => page(HTML_PAGE));
    await new WebSourceAdapter(http).fetch(config);
    expect(http.calls[0]?.options?.allowedContentTypes).toEqual([
      'text/html',
      'application/xhtml+xml',
    ]);
  });

  it('normalizes a page into a single item', async () => {
    const result = await new WebSourceAdapter(new FakeHttp(() => page(HTML_PAGE))).fetch(config);
    const item = result.items[0];

    expect(result.items).toHaveLength(1);
    expect(item?.canonicalUrl).toBe('https://web.test/article');
    expect(item?.externalItemId).toBe('https://web.test/article');
    expect(item?.title).toBe('Page & title');
    expect(item?.text).toBe('First paragraph. Second paragraph with \u2026 an ellipsis.');
  });

  it('never lets script or style content reach the item', async () => {
    const result = await new WebSourceAdapter(new FakeHttp(() => page(HTML_PAGE))).fetch(config);
    const item = result.items[0];
    expect(item?.text).not.toContain('tracker');
    expect(item?.text).not.toContain('moreTracking');
    expect(item?.text).not.toContain('color: red');
    expect(item?.text).not.toContain('Skip to content');
  });

  it('collects og:image and in-article images, resolving relative sources', async () => {
    const result = await new WebSourceAdapter(new FakeHttp(() => page(HTML_PAGE))).fetch(config);
    expect((result.items[0]?.images ?? []).map((image) => image.url)).toEqual([
      'https://cdn.web.test/hero.jpg',
      'https://web.test/img/inline.png',
    ]);
  });

  it('refuses a hostile canonical and falls back to the fetched URL', async () => {
    const result = await new WebSourceAdapter(
      new FakeHttp(() => page(HTML_PAGE_HOSTILE_CANONICAL)),
    ).fetch(config);

    expect(result.items[0]?.canonicalUrl).toBe(PAGE_URL);
    expect(result.items[0]?.images).toEqual([]);
  });

  it('quarantines a page that parses to nothing', async () => {
    const result = await new WebSourceAdapter(new FakeHttp(() => page(HTML_PAGE_BLANK))).fetch(
      config,
    );

    expect(result.items).toEqual([]);
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0]?.reason).toContain('no usable title or text');
  });

  it('reports an unchanged page as not modified on the second fetch', async () => {
    const adapter = new WebSourceAdapter(new FakeHttp(() => page(HTML_PAGE)));
    const first = await adapter.fetch(config);
    const second = await adapter.fetch(config, first.cursor ?? undefined);

    expect(first.items).toHaveLength(1);
    expect(second.items).toEqual([]);
    expect(second.notModified).toBe(true);
  });

  it('honours a 304 without parsing a body', async () => {
    const stored = JSON.stringify({ v: 1, etag: 'W/"page"' });
    const result = await new WebSourceAdapter(
      new FakeHttp(() => page('', { status: 304, contentType: null })),
    ).fetch(config, stored);

    expect(result.notModified).toBe(true);
    expect(result.cursor).toBe(stored);
  });

  it('maps a transport failure onto a health report', async () => {
    const report = await new WebSourceAdapter(
      new FakeHttp(() => {
        throw new SourceIntegrationError('TIMEOUT', 'The operation timed out');
      }),
    ).health(config);

    expect(report.status).toBe('FAILED');
    expect(report.errorCategory).toBe('TIMEOUT');
    expect(report.errorMessage).toContain('timed out');
  });
});
