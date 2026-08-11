/**
 * The only transport port the adapters know about. No Node types, no provider
 * SDK, no fetch specifics: an adapter can be unit tested with a plain object.
 */
export interface HttpRequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  /** Media types the caller can actually parse. Empty or absent means any. */
  allowedContentTypes?: readonly string[];
}

export interface HttpResponse {
  /** Final URL, after every redirect hop was revalidated. */
  url: string;
  status: number;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  /** Empty string for 304 Not Modified. */
  body: string;
}

export interface SafeHttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}
