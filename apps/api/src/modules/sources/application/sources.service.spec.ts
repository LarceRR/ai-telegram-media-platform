import { Prisma } from '@atmp/database';
import type { IngestSourceJob } from '@atmp/contracts';
import type { HttpRequestOptions, HttpResponse, SafeHttpClient } from '../domain/safe-http-client';
import { SourceIntegrationError } from '../domain/source-errors';
import { RssSourceAdapter } from '../infrastructure/adapters/rss-source.adapter';
import { SourceAdapterRegistry } from '../infrastructure/source-adapter.registry';
import {
  DUPLICATE_TEXT_FEED,
  NO_DATES_FEED,
  PARTIALLY_BROKEN_FEED,
  RSS_2_FEED,
} from '../infrastructure/adapters/feed.fixtures';
import { SourcesService } from './sources.service';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { QueueRegistry } from '../../../infrastructure/queue/queue.registry';
import type { AuditLogService } from '../../system/application/audit-log.service';

interface FakeSource {
  id: string;
  name: string;
  type: 'RSS' | 'WEB';
  url: string;
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  categories: string[];
  lastCursor: string | null;
  lastIngestedAt: Date | null;
}

interface StoredItem {
  sourceId: string;
  externalItemId: string;
  contentHash: string;
  title: string;
}

interface StoredSnapshot {
  sourceId: string;
  status: string;
  httpStatus: number | null;
  errorCategory: string | null;
  errorMessage: string | null;
}

interface FakeLink {
  id: string;
  channelId: string;
  sourceId: string;
  priority: number;
  enabled: boolean;
}

/**
 * An in-memory stand-in for the two tables that matter here. It enforces the
 * same unique constraints as the schema, which is the whole point: the dedupe
 * behaviour under test is a database guarantee, not an application guess.
 */
class FakeDatabase {
  readonly sources = new Map<string, FakeSource>();
  readonly items = new Map<string, StoredItem>();
  readonly snapshots: StoredSnapshot[] = [];
  readonly links: FakeLink[] = [];
  upsertCalls = 0;

  addSource(source: Partial<FakeSource> & { id: string; url: string }): FakeSource {
    const stored: FakeSource = {
      name: source.id,
      type: 'RSS',
      status: 'ACTIVE',
      categories: [],
      lastCursor: null,
      lastIngestedAt: null,
      ...source,
    };
    this.sources.set(stored.id, stored);
    this.links.push({
      id: `link-${stored.id}`,
      channelId: 'chan-1',
      sourceId: stored.id,
      priority: 0,
      enabled: true,
    });
    return stored;
  }

  link(sourceId: string): FakeLink {
    const found = this.links.find((candidate) => candidate.sourceId === sourceId);
    if (!found) throw new Error(`no link for ${sourceId}`);
    return found;
  }

  snapshotFor(sourceId: string): StoredSnapshot | undefined {
    return this.snapshots.filter((entry) => entry.sourceId === sourceId).at(-1);
  }

  asPrisma(): PrismaService {
    return {
      user: {
        findFirst: async () => ({ id: 'user-1', email: 'owner@test.local' }),
      },
      channelMember: {
        findFirst: async () => ({ id: 'member-1', role: 'OWNER' }),
      },
      channelSource: {
        findFirst: async ({
          where,
        }: {
          where: { channelId: string; sourceId: string; enabled?: boolean };
        }) => {
          const found = this.links.find(
            (candidate) =>
              candidate.channelId === where.channelId &&
              candidate.sourceId === where.sourceId &&
              (where.enabled === undefined || candidate.enabled === where.enabled),
          );
          return found ? { ...found, source: this.sources.get(found.sourceId) ?? null } : null;
        },
        findMany: async () =>
          this.links.filter((candidate) => candidate.enabled).map(({ sourceId }) => ({ sourceId })),
      },
      source: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          this.sources.get(where.id) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { lastCursor?: string | null; lastIngestedAt?: Date };
        }) => {
          const source = this.sources.get(where.id);
          if (!source) throw new Error(`no source ${where.id}`);
          if (data.lastCursor !== undefined) source.lastCursor = data.lastCursor;
          if (data.lastIngestedAt !== undefined) source.lastIngestedAt = data.lastIngestedAt;
          return source;
        },
      },
      sourceItem: {
        upsert: async (args: {
          where: { sourceId_externalItemId: { sourceId: string; externalItemId: string } };
          create: { contentHash: string; title: string };
        }) => {
          this.upsertCalls += 1;
          const { sourceId, externalItemId } = args.where.sourceId_externalItemId;
          const key = `${sourceId}|${externalItemId}`;
          const collision = [...this.items.entries()].some(
            ([existingKey, item]) =>
              existingKey !== key &&
              item.sourceId === sourceId &&
              item.contentHash === args.create.contentHash,
          );
          if (collision) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`source_id`,`content_hash`)',
              { code: 'P2002', clientVersion: '5.22.0' },
            );
          }
          const stored: StoredItem = {
            sourceId,
            externalItemId,
            contentHash: args.create.contentHash,
            title: args.create.title,
          };
          this.items.set(key, stored);
          return stored;
        },
      },
      sourceHealthSnapshot: {
        create: async ({ data }: { data: StoredSnapshot }) => {
          this.snapshots.push(data);
          return data;
        },
      },
    } as unknown as PrismaService;
  }
}

class FakeTransport implements SafeHttpClient {
  constructor(private readonly handler: (url: string) => HttpResponse) {}

  async get(url: string, _options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.handler(url);
  }
}

function feed(url: string, body: string): HttpResponse {
  return {
    url,
    status: 200,
    contentType: 'application/rss+xml',
    etag: null,
    lastModified: null,
    body,
  };
}

function job(sourceId: string): IngestSourceJob {
  return {
    correlationId: '11111111-1111-4111-8111-111111111111',
    enqueuedAt: new Date().toISOString(),
    enqueuedBy: 'api',
    attemptHint: 0,
    sourceId,
    channelId: '22222222-2222-4222-8222-222222222222',
  };
}

function build(db: FakeDatabase, handler: (url: string) => HttpResponse) {
  const enqueue = jest.fn(async (..._args: unknown[]) => 'job-1');
  const registry = new SourceAdapterRegistry([new RssSourceAdapter(new FakeTransport(handler))]);
  const service = new SourcesService(
    db.asPrisma(),
    { enqueue } as unknown as QueueRegistry,
    { record: jest.fn(async () => 'audit-1') } as unknown as AuditLogService,
    registry,
  );
  return { service, enqueue };
}

describe('SourcesService ingestion', () => {
  it('upserts on a repeated fetch instead of duplicating items', async () => {
    const db = new FakeDatabase();
    db.addSource({ id: 'src-undated', url: 'https://feed.test/undated.xml' });
    const { service } = build(db, (url) => feed(url, NO_DATES_FEED));

    await service.process(job('src-undated'));
    await service.process(job('src-undated'));

    // Four upsert attempts, two surviving rows: the unique key did the work.
    expect(db.upsertCalls).toBe(4);
    expect(db.items.size).toBe(2);
    expect(db.snapshots.every((entry) => entry.status === 'HEALTHY')).toBe(true);
  });

  it('persists the cursor and stops refetching known entries', async () => {
    const db = new FakeDatabase();
    db.addSource({ id: 'src-dated', url: 'https://feed.test/rss.xml' });
    const { service } = build(db, (url) => feed(url, RSS_2_FEED));

    await service.process(job('src-dated'));
    const cursor = db.sources.get('src-dated')?.lastCursor;
    expect(cursor).toContain('2026-08-11T09:00:00.000Z');
    expect(db.upsertCalls).toBe(2);

    await service.process(job('src-dated'));
    expect(db.upsertCalls).toBe(2);
    expect(db.items.size).toBe(2);
    expect(db.sources.get('src-dated')?.lastIngestedAt).toBeInstanceOf(Date);
  });

  it('degrades health for a quarantined entry without failing the run', async () => {
    const db = new FakeDatabase();
    db.addSource({ id: 'src-partial', url: 'https://feed.test/partial.xml' });
    const { service } = build(db, (url) => feed(url, PARTIALLY_BROKEN_FEED));

    await service.process(job('src-partial'));

    expect(db.items.size).toBe(1);
    const snapshot = db.snapshotFor('src-partial');
    expect(snapshot?.status).toBe('DEGRADED');
    expect(snapshot?.errorCategory).toBe('MALFORMED_ITEM');
    expect(snapshot?.errorMessage).toContain('no usable HTTP(S) link');
  });

  it('skips a content-hash collision instead of failing the job', async () => {
    const db = new FakeDatabase();
    db.addSource({ id: 'src-dup', url: 'https://feed.test/dup.xml' });
    const { service } = build(db, (url) => feed(url, DUPLICATE_TEXT_FEED));

    await service.process(job('src-dup'));

    expect(db.items.size).toBe(1);
    const snapshot = db.snapshotFor('src-dup');
    expect(snapshot?.status).toBe('HEALTHY');
    expect(snapshot?.errorMessage).toBe('1 duplicate item(s) skipped');
  });

  it('isolates a broken source: the healthy one still ingests', async () => {
    const db = new FakeDatabase();
    db.addSource({ id: 'src-broken', url: 'https://broken.test/rss.xml' });
    db.addSource({ id: 'src-healthy', url: 'https://feed.test/undated.xml' });
    const { service } = build(db, (url) => {
      if (url.includes('broken.test')) {
        throw new SourceIntegrationError('UPSTREAM_UNAVAILABLE', 'Source returned HTTP 503', {
          httpStatus: 503,
        });
      }
      return feed(url, NO_DATES_FEED);
    });

    await expect(service.process(job('src-broken'))).rejects.toBeInstanceOf(SourceIntegrationError);
    await service.process(job('src-healthy'));

    const broken = db.snapshotFor('src-broken');
    expect(broken?.status).toBe('FAILED');
    expect(broken?.errorCategory).toBe('UPSTREAM_UNAVAILABLE');
    expect(broken?.httpStatus).toBe(503);

    expect(db.snapshotFor('src-healthy')?.status).toBe('HEALTHY');
    expect([...db.items.values()].every((item) => item.sourceId === 'src-healthy')).toBe(true);
    expect(db.items.size).toBe(2);
  });

  it('does nothing for a source that is not active', async () => {
    const db = new FakeDatabase();
    db.addSource({ id: 'src-paused', url: 'https://feed.test/paused.xml', status: 'PAUSED' });
    const { service } = build(db, (url) => feed(url, RSS_2_FEED));

    await service.process(job('src-paused'));

    expect(db.items.size).toBe(0);
    expect(db.snapshots).toHaveLength(0);
  });
});

describe('SourcesService triggering', () => {
  it('collapses repeated triggers inside one rate-limit window onto one key', async () => {
    const db = new FakeDatabase();
    db.addSource({ id: 'src-rss', url: 'https://feed.test/rss.xml' });
    const { service, enqueue } = build(db, (url) => feed(url, RSS_2_FEED));

    await service.enqueue('user-1', 'chan-1', 'src-rss');
    await service.enqueue('user-1', 'chan-1', 'src-rss');

    const keys = enqueue.mock.calls.map((call) => String(call[3]));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toContain('ingest-run:src-rss:chan-1:');
  });

  it('refuses to trigger a disabled binding', async () => {
    const db = new FakeDatabase();
    db.addSource({ id: 'src-off', url: 'https://feed.test/off.xml' });
    db.link('src-off').enabled = false;
    const { service } = build(db, (url) => feed(url, RSS_2_FEED));

    await expect(service.enqueue('user-1', 'chan-1', 'src-off')).rejects.toMatchObject({
      category: 'NOT_FOUND',
    });
  });

  it('refuses to trigger a paused source', async () => {
    const db = new FakeDatabase();
    db.addSource({ id: 'src-paused', url: 'https://feed.test/paused.xml', status: 'PAUSED' });
    const { service } = build(db, (url) => feed(url, RSS_2_FEED));

    await expect(service.enqueue('user-1', 'chan-1', 'src-paused')).rejects.toMatchObject({
      category: 'CONFLICT',
    });
  });

  it('reports per-source outcomes when triggering a whole channel', async () => {
    const db = new FakeDatabase();
    db.addSource({ id: 'src-ok', url: 'https://feed.test/ok.xml' });
    db.addSource({ id: 'src-bad', url: 'https://feed.test/bad.xml', status: 'PAUSED' });
    const { service } = build(db, (url) => feed(url, RSS_2_FEED));

    const results = await service.ingestAll('user-1', 'chan-1');

    expect(results).toHaveLength(2);
    expect(results.find((entry) => entry.sourceId === 'src-ok')?.jobId).toBe('job-1');
    expect(results.find((entry) => entry.sourceId === 'src-bad')?.error).toContain('paused');
  });
});
