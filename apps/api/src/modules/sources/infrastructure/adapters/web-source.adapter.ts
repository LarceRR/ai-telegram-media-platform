import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  sourceItemPayloadSchema,
  type HttpSourceCursor,
  type SourceItemImage,
  type SourceType,
} from '@atmp/contracts';
import type { SafeHttpClient } from '../../domain/safe-http-client';
import type {
  SourceAdapter,
  SourceFetchConfig,
  SourceFetchResult,
  SourceHealthReport,
  SourceRateLimit,
} from '../../domain/source-adapter';
import { SAFE_HTTP_CLIENT } from '../source.tokens';
import {
  cleanText,
  collapseWhitespace,
  elementText,
  extractElements,
  findOpenTags,
  firstElement,
  readAttribute,
  safeAbsoluteUrl,
  stripHiddenBlocks,
} from '../markup/safe-markup';
import { conditionalHeaders, decodeCursor, encodeCursor } from './http-cursor';
import { probeSourceHealth } from './source-health';

/** A generic web source is an HTML document. Anything else is a misconfiguration. */
const WEB_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'] as const;

const MAX_PARAGRAPHS = 40;
const MAX_IMAGES = 20;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function canonicalFrom(body: string, base: string): string | undefined {
  for (const tag of findOpenTags(body, ['link'], 40)) {
    if ((readAttribute(tag, 'rel') ?? '').toLowerCase() !== 'canonical') continue;
    const href = safeAbsoluteUrl(readAttribute(tag, 'href'), base);
    if (href !== undefined) return href;
  }
  return undefined;
}

function metaContent(body: string, names: readonly string[]): string {
  const tags = findOpenTags(body, ['meta'], 80);
  for (const wanted of names) {
    for (const tag of tags) {
      const key = (readAttribute(tag, 'property') ?? readAttribute(tag, 'name') ?? '').toLowerCase();
      if (key !== wanted) continue;
      const content = readAttribute(tag, 'content');
      if (content !== undefined && content.trim() !== '') return collapseWhitespace(content);
    }
  }
  return '';
}

function articleText(body: string): string {
  const container = firstElement(body, ['article', 'main']);
  if (container !== undefined) {
    const text = cleanText(container.inner);
    if (text !== '') return text;
  }
  const paragraphs = extractElements(body, ['p'], MAX_PARAGRAPHS)
    .map((element) => element.inner)
    .join(' ');
  return cleanText(paragraphs);
}

function webImages(body: string, base: string): SourceItemImage[] {
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

  const openGraph = metaContent(body, ['og:image']);
  add(openGraph === '' ? undefined : openGraph);

  const scope = firstElement(body, ['article', 'main'])?.inner ?? body;
  for (const tag of findOpenTags(stripHiddenBlocks(scope), ['img'], 60)) {
    add(readAttribute(tag, 'src'), readAttribute(tag, 'alt'));
  }

  return images;
}

@Injectable()
export class WebSourceAdapter implements SourceAdapter {
  readonly type: SourceType = 'WEB';
  readonly rateLimit: SourceRateLimit = {
    minIntervalMs: 900_000,
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
      allowedContentTypes: WEB_CONTENT_TYPES,
    });

    const unchanged: SourceFetchResult = {
      items: [],
      quarantined: [],
      cursor: cursor ?? null,
      httpStatus: response.status,
      notModified: true,
    };
    if (response.status === 304) return unchanged;

    const canonicalUrl = canonicalFrom(response.body, response.url) ?? response.url;
    const title = elementText(response.body, ['title']);
    const description = metaContent(response.body, ['og:description', 'description']);
    const body = articleText(response.body);
    const text = body !== '' ? body : description;

    const validators: HttpSourceCursor = {
      v: 1,
      etag: response.etag?.slice(0, 300),
      lastModified: response.lastModified?.slice(0, 200),
    };

    if (title === '' && text === '') {
      // A page that parses to nothing is quarantined, not retried forever.
      return {
        items: [],
        quarantined: [
          { externalItemId: canonicalUrl, reason: 'Page produced no usable title or text' },
        ],
        cursor: encodeCursor(validators),
        httpStatus: response.status,
        notModified: false,
      };
    }

    const contentHash = sha256(normalize(text !== '' ? text : title));
    if (previous?.contentHash === contentHash) return unchanged;

    const candidate = {
      externalItemId:
        canonicalUrl.length <= 512 ? canonicalUrl : `sha256:${sha256(canonicalUrl)}`,
      canonicalUrl,
      title: (title !== '' ? title : canonicalUrl).slice(0, 500),
      text: (text !== '' ? text : title).slice(0, 500_000),
      images: webImages(response.body, response.url),
    };

    const parsed = sourceItemPayloadSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        items: [],
        quarantined: [
          {
            externalItemId: candidate.externalItemId,
            reason: parsed.error.issues
              .map((issue) => `${issue.path.join('.') || 'item'}: ${issue.message}`)
              .join('; ')
              .slice(0, 300),
          },
        ],
        cursor: encodeCursor(validators),
        httpStatus: response.status,
        notModified: false,
      };
    }

    return {
      items: [parsed.data],
      quarantined: [],
      cursor: encodeCursor({ ...validators, contentHash }),
      httpStatus: response.status,
      notModified: false,
    };
  }

  async health(config: SourceFetchConfig): Promise<SourceHealthReport> {
    return probeSourceHealth(() => this.fetch(config));
  }
}
