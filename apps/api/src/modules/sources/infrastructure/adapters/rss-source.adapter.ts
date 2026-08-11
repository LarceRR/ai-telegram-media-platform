import { Inject, Injectable } from '@nestjs/common';
import {
  sourceItemPayloadSchema,
  type HttpSourceCursor,
  type SourceItemImage,
  type SourceItemPayload,
  type SourceType,
} from '@atmp/contracts';
import type { SafeHttpClient } from '../../domain/safe-http-client';
import type {
  QuarantinedSourceItem,
  SourceAdapter,
  SourceFetchConfig,
  SourceFetchResult,
  SourceHealthReport,
  SourceRateLimit,
} from '../../domain/source-adapter';
import { SourceIntegrationError } from '../../domain/source-errors';
import { SAFE_HTTP_CLIENT } from '../source.tokens';
import {
  cleanText,
  elementText,
  extractElements,
  findOpenTags,
  firstElement,
  readAttribute,
  safeAbsoluteUrl,
  unwrapCdata,
} from '../markup/safe-markup';
import { conditionalHeaders, decodeCursor, encodeCursor } from './http-cursor';
import { probeSourceHealth } from './source-health';

/**
 * Deliberately wide: a large share of real feeds are served as text/html or
 * text/plain by misconfigured origins. The allowlist still excludes binaries,
 * which is what the check is there for.
 */
const RSS_CONTENT_TYPES = [
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'application/rdf+xml',
  'application/xhtml+xml',
  'text/xml',
  'text/html',
  'text/plain',
] as const;

const MAX_ENTRIES = 100;
const MAX_IMAGES = 20;
const TEXT_ELEMENTS = ['content:encoded', 'description', 'summary', 'content'] as const;
const DATE_ELEMENTS = ['pubdate', 'published', 'updated', 'dc:date', 'date'] as const;

type BuiltEntry = { readonly item: SourceItemPayload } | QuarantinedSourceItem;

function pickText(inner: string, names: readonly string[]): string {
  for (const name of names) {
    const value = elementText(inner, [name]);
    if (value !== '') return value;
  }
  return '';
}

function entryLink(inner: string, base: string): string | undefined {
  const text = elementText(inner, ['link']);
  const fromText = safeAbsoluteUrl(text === '' ? undefined : text, base);
  if (fromText !== undefined) return fromText;

  for (const tag of findOpenTags(inner, ['link'], 10)) {
    const rel = readAttribute(tag, 'rel');
    if (rel !== undefined && rel.toLowerCase() !== 'alternate') continue;
    const href = safeAbsoluteUrl(readAttribute(tag, 'href'), base);
    if (href !== undefined) return href;
  }
  return undefined;
}

function entryAuthor(inner: string): string | undefined {
  const author = firstElement(inner, ['author']);
  if (author !== undefined) {
    const name = elementText(author.inner, ['name']);
    const value = name !== '' ? name : cleanText(author.inner);
    if (value !== '') return value.slice(0, 300);
  }
  const creator = elementText(inner, ['dc:creator']);
  return creator === '' ? undefined : creator.slice(0, 300);
}

function entryPublishedAt(inner: string): string | undefined {
  for (const name of DATE_ELEMENTS) {
    const raw = elementText(inner, [name]);
    if (raw === '') continue;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

function entryImages(inner: string, base: string): SourceItemImage[] {
  const images: SourceItemImage[] = [];
  const seen = new Set<string>();

  const add = (rawUrl: string | undefined, rawAlt?: string): void => {
    if (images.length >= MAX_IMAGES) return;
    const url = safeAbsoluteUrl(rawUrl, base);
    if (url === undefined || seen.has(url)) return;
    seen.add(url);
    const alt = rawAlt === undefined ? '' : rawAlt.trim().slice(0, 500);
    images.push(alt === '' ? { url } : { url, alt });
  };

  for (const tag of findOpenTags(inner, ['enclosure'], 20)) {
    if (!(readAttribute(tag, 'type') ?? '').toLowerCase().startsWith('image/')) continue;
    add(readAttribute(tag, 'url'));
  }

  for (const tag of findOpenTags(inner, ['media:content', 'media:thumbnail'], 20)) {
    const type = (readAttribute(tag, 'type') ?? '').toLowerCase();
    const medium = (readAttribute(tag, 'medium') ?? '').toLowerCase();
    const isThumbnail = tag.toLowerCase().startsWith('<media:thumbnail');
    if (!isThumbnail && !type.startsWith('image/') && medium !== 'image') continue;
    add(readAttribute(tag, 'url'));
  }

  // Inline markup usually arrives wrapped in CDATA, so unwrap before scanning.
  for (const tag of findOpenTags(unwrapCdata(inner), ['img'], 40)) {
    add(readAttribute(tag, 'src'), readAttribute(tag, 'alt'));
  }

  return images;
}

@Injectable()
export class RssSourceAdapter implements SourceAdapter {
  readonly type: SourceType = 'RSS';
  readonly rateLimit: SourceRateLimit = {
    minIntervalMs: 300_000,
    maxRequestsPerFetch: 1,
    requestTimeoutMs: 20_000,
    maxResponseBytes: 5_000_000,
  };

  constructor(@Inject(SAFE_HTTP_CLIENT) private readonly http: SafeHttpClient) {}

  async fetch(config: SourceFetchConfig, cursor?: string): Promise<SourceFetchResult> {
    const previous = decodeCursor(cursor);
    const response = await this.http.get(config.url, {
      headers: conditionalHeaders(previous),
      timeoutMs: this.rateLimit.requestTimeoutMs,
      maxResponseBytes: this.rateLimit.maxResponseBytes,
      allowedContentTypes: RSS_CONTENT_TYPES,
    });

    if (response.status === 304) {
      return {
        items: [],
        quarantined: [],
        cursor: cursor ?? null,
        httpStatus: 304,
        notModified: true,
      };
    }

    const entries = extractElements(response.body, ['item', 'entry'], MAX_ENTRIES);
    if (entries.length === 0) {
      throw new SourceIntegrationError(
        'CONTRACT_VIOLATION',
        'Feed contains no items or entries',
        { url: response.url },
      );
    }

    const watermark = previous?.newestPublishedAt;
    const items: SourceItemPayload[] = [];
    const quarantined: QuarantinedSourceItem[] = [];
    let newest = watermark;

    entries.forEach((entry, index) => {
      const built = buildEntry(entry.inner, response.url, index);
      if ('reason' in built) {
        quarantined.push(built);
        return;
      }
      const publishedAt = built.item.publishedAt;
      if (publishedAt !== undefined) {
        if (newest === undefined || publishedAt > newest) newest = publishedAt;
        // Watermark is exclusive: an item already at the mark is not new.
        if (watermark !== undefined && publishedAt <= watermark) return;
      }
      items.push(built.item);
    });

    const next: HttpSourceCursor = {
      v: 1,
      etag: response.etag?.slice(0, 300),
      lastModified: response.lastModified?.slice(0, 200),
      newestPublishedAt: newest,
    };

    return {
      items,
      quarantined,
      cursor: encodeCursor(next),
      httpStatus: response.status,
      notModified: false,
    };
  }

  async health(config: SourceFetchConfig): Promise<SourceHealthReport> {
    return probeSourceHealth(() => this.fetch(config));
  }
}

function buildEntry(inner: string, base: string, index: number): BuiltEntry {
  const canonicalUrl = entryLink(inner, base);
  const guid = elementText(inner, ['guid']) || elementText(inner, ['id']);

  if (canonicalUrl === undefined) {
    return {
      externalItemId: guid === '' ? null : guid.slice(0, 512),
      reason: `Entry ${index + 1} has no usable HTTP(S) link`,
    };
  }

  const title = elementText(inner, ['title']);
  const text = pickText(inner, TEXT_ELEMENTS);
  const candidate = {
    externalItemId: (guid === '' ? canonicalUrl : guid).slice(0, 512),
    canonicalUrl,
    title: (title === '' ? text.slice(0, 120) : title).slice(0, 500),
    author: entryAuthor(inner),
    publishedAt: entryPublishedAt(inner),
    text: (text === '' ? title : text).slice(0, 500_000),
    images: entryImages(inner, base),
  };

  const parsed = sourceItemPayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      externalItemId: candidate.externalItemId,
      reason: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'item'}: ${issue.message}`)
        .join('; ')
        .slice(0, 300),
    };
  }
  return { item: parsed.data };
}
