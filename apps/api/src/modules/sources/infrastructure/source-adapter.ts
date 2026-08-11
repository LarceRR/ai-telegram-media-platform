import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import type { SourceItemPayload } from '@atmp/contracts';

export interface SourceAdapterConfig {
  url: string;
  type: 'RSS' | 'WEB';
}
export interface SourceAdapter {
  fetch(config: SourceAdapterConfig, cursor?: string): Promise<SourceItemPayload[]>;
}

function assertSafeUrl(value: string): URL {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new Error('Only HTTP(S) sources are supported');
  if (parsed.username || parsed.password) throw new Error('Source URL credentials are not allowed');
  return parsed;
}
function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const octets = ip.split('.').map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31)
    );
  }
  return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:');
}
async function safeFetch(value: string): Promise<{ response: Response; body: string }> {
  let url = assertSafeUrl(value);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const records = await lookup(url.hostname, { all: true });
    if (records.some((record) => privateIp(record.address)))
      throw new Error('Source resolves to a private address');
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': 'ATMP-ingestion/1.0' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect missing location');
      url = assertSafeUrl(new URL(location, url).toString());
      continue;
    }
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 5_000_000) throw new Error('Source response is too large');
    const body = await response.text();
    if (body.length > 5_000_000) throw new Error('Source response is too large');
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
    return { response, body };
  }
  throw new Error('Too many redirects');
}
function clean(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(
      /&(?:amp|lt|gt|quot|apos);/g,
      (v) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[v] ?? v,
    )
    .replace(/\s+/g, ' ')
    .trim();
}
function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? clean(match[1] ?? '') : '';
}
function hash(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex');
}
export class RssSourceAdapter implements SourceAdapter {
  async fetch(config: SourceAdapterConfig): Promise<SourceItemPayload[]> {
    const { body } = await safeFetch(config.url);
    const entries = [...body.matchAll(/<(item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].slice(0, 100);
    return entries
      .map((entry, index) => {
        const xml = entry[0];
        const link =
          tag(xml, 'link') || (xml.match(/<link[^>]+href=["']([^"']+)/i)?.[1] ?? config.url);
        const title = tag(xml, 'title') || `Untitled item ${index + 1}`;
        const text =
          tag(xml, 'content:encoded') || tag(xml, 'description') || tag(xml, 'summary') || title;
        const published = tag(xml, 'pubDate') || tag(xml, 'published') || tag(xml, 'updated');
        const canonicalUrl = new URL(link, config.url).toString();
        return {
          externalItemId: canonicalUrl,
          canonicalUrl,
          title,
          author: tag(xml, 'author') || tag(xml, 'dc:creator') || undefined,
          publishedAt: published ? new Date(published).toISOString() : undefined,
          text: clean(text),
          images: [],
        };
      })
      .filter((item) => item.text.length > 0);
  }
}
export class WebSourceAdapter implements SourceAdapter {
  async fetch(config: SourceAdapterConfig): Promise<SourceItemPayload[]> {
    const { body } = await safeFetch(config.url);
    const title = clean(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? config.url);
    const description = clean(
      body.match(
        /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)/i,
      )?.[1] ?? '',
    );
    const text =
      description ||
      clean(
        [...body.matchAll(/<(?:article|main|p)\b[^>]*>([\s\S]*?)<\/(?:article|main|p)>/gi)]
          .slice(0, 40)
          .map((m) => m[1] ?? '')
          .join(' '),
      );
    const canonicalUrl = new URL(
      body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1] ?? config.url,
      config.url,
    ).toString();
    return [
      {
        externalItemId: canonicalUrl,
        canonicalUrl,
        title: title || canonicalUrl,
        text: text || title,
        images: [],
      },
    ];
  }
}
export function adapterFor(type: 'RSS' | 'WEB'): SourceAdapter {
  return type === 'RSS' ? new RssSourceAdapter() : new WebSourceAdapter();
}
