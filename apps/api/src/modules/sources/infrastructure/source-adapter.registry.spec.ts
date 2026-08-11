import type { SourceType } from '@atmp/contracts';
import { SourceAdapterRegistry } from './source-adapter.registry';
import type { SourceAdapter, SourceFetchResult, SourceHealthReport } from '../domain/source-adapter';

function stub(type: SourceType, minIntervalMs = 60_000): SourceAdapter {
  return {
    type,
    rateLimit: {
      minIntervalMs,
      maxRequestsPerFetch: 1,
      requestTimeoutMs: 1_000,
      maxResponseBytes: 1_000,
    },
    fetch: async (): Promise<SourceFetchResult> => ({
      items: [],
      quarantined: [],
      cursor: null,
      httpStatus: 200,
      notModified: false,
    }),
    health: async (): Promise<SourceHealthReport> => ({
      status: 'HEALTHY',
      latencyMs: 1,
      httpStatus: 200,
      errorCategory: null,
      errorMessage: null,
    }),
  };
}

describe('SourceAdapterRegistry', () => {
  it('resolves an adapter by source type', () => {
    const registry = new SourceAdapterRegistry([stub('RSS'), stub('WEB')]);
    expect(registry.get('RSS').type).toBe('RSS');
    expect(registry.get('WEB').type).toBe('WEB');
    expect(registry.supportedTypes()).toEqual(['RSS', 'WEB']);
  });

  it('exposes rate-limit metadata per type', () => {
    const registry = new SourceAdapterRegistry([stub('RSS', 30_000)]);
    expect(registry.rateLimitFor('RSS').minIntervalMs).toBe(30_000);
  });

  it('refuses to register two adapters for one type', () => {
    expect(() => new SourceAdapterRegistry([stub('RSS'), stub('RSS')])).toThrow(/Duplicate/);
  });

  it('fails loudly for an unregistered type', () => {
    const registry = new SourceAdapterRegistry([stub('RSS')]);
    expect(() => registry.get('WEB')).toThrow(/No source adapter registered/);
  });
});
