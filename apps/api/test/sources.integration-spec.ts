import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Logger } from '@atmp/shared';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { SourcesService } from '../src/modules/sources/application/sources.service';
import { SAFE_HTTP_CLIENT } from '../src/modules/sources/infrastructure/source.tokens';
import type { HttpResponse, SafeHttpClient } from '../src/modules/sources/domain/safe-http-client';
import { SourceIntegrationError } from '../src/modules/sources/domain/source-errors';
import {
  NO_DATES_FEED,
  RSS_2_FEED,
} from '../src/modules/sources/infrastructure/adapters/feed.fixtures';

/**
 * Only the transport is faked. Adapters, validation, persistence, unique
 * constraints, the queue and the HTTP layer are all real, so this is the
 * milestone's exit gate rather than a mock choreography.
 */
const transport: SafeHttpClient = {
  async get(url: string): Promise<HttpResponse> {
    if (url.includes('broken.test')) {
      throw new SourceIntegrationError('UPSTREAM_UNAVAILABLE', 'Source returned HTTP 503', {
        httpStatus: 503,
        url,
      });
    }
    return {
      url,
      status: 200,
      contentType: 'application/rss+xml',
      etag: null,
      lastModified: null,
      body: url.includes('undated') ? NO_DATES_FEED : RSS_2_FEED,
    };
  },
};

describe('sources and ingestion (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sources: SourcesService;
  let ownerId: string;
  let channelId: string;
  let datedSourceId: string;
  let undatedSourceId: string;
  let brokenSourceId: string;

  const ingest = (sourceId: string) =>
    sources.process({
      correlationId: crypto.randomUUID(),
      enqueuedAt: new Date().toISOString(),
      enqueuedBy: 'api',
      attemptHint: 0,
      sourceId,
      channelId,
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SAFE_HTTP_CLIENT)
      .useValue(transport)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    const logger = { error: jest.fn(), warn: jest.fn() } as unknown as Logger;
    app.useGlobalFilters(new AllExceptionsFilter(logger));
    await app.init();

    prisma = app.get(PrismaService);
    sources = app.get(SourcesService);

    const unique = Date.now();
    const owner = await request(app.getHttpServer())
      .post('/api/v1/access/bootstrap')
      .send({ email: `sources-owner-${unique}@test.local`, displayName: 'Owner' })
      .expect(201);
    ownerId = owner.body.id;

    const channel = await request(app.getHttpServer())
      .post('/api/v1/channels')
      .set('x-actor-id', ownerId)
      .send({ telegramId: `tg-sources-${unique}`, title: 'M2 channel', language: 'en' })
      .expect(201);
    channelId = channel.body.id;

    const dated = await request(app.getHttpServer())
      .post(`/api/v1/channels/${channelId}/sources`)
      .set('x-actor-id', ownerId)
      .send({
        name: 'Dated feed',
        type: 'RSS',
        url: `https://feed.test/${unique}/dated.xml`,
        priority: 10,
        categories: ['news', 'tech'],
      })
      .expect(201);
    datedSourceId = dated.body.id;

    const undated = await request(app.getHttpServer())
      .post(`/api/v1/channels/${channelId}/sources`)
      .set('x-actor-id', ownerId)
      .send({ name: 'Undated feed', type: 'RSS', url: `https://feed.test/${unique}/undated.xml` })
      .expect(201);
    undatedSourceId = undated.body.id;

    const broken = await request(app.getHttpServer())
      .post(`/api/v1/channels/${channelId}/sources`)
      .set('x-actor-id', ownerId)
      .send({ name: 'Broken feed', type: 'RSS', url: `https://broken.test/${unique}/rss.xml` })
      .expect(201);
    brokenSourceId = broken.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('exposes categories, priority and binding state on the source list', async () => {
    const listed = await request(app.getHttpServer())
      .get(`/api/v1/channels/${channelId}/sources`)
      .set('x-actor-id', ownerId)
      .expect(200);

    const dated = listed.body.find((item: { id: string }) => item.id === datedSourceId);
    expect(dated.categories).toEqual(['news', 'tech']);
    expect(dated.priority).toBe(10);
    expect(dated.enabled).toBe(true);
    expect(dated.lastHealthStatus).toBeNull();
  });

  it('normalizes a feed into rows with provenance and images', async () => {
    await ingest(datedSourceId);

    const stored = await prisma.sourceItem.findMany({
      where: { sourceId: datedSourceId },
      include: { images: true },
      orderBy: { externalItemId: 'asc' },
    });
    expect(stored).toHaveLength(2);

    const first = stored.find((item) => item.externalItemId === 'post-1');
    expect(first?.canonicalUrl).toBe('https://feed.test/posts/1');
    expect(first?.title).toBe('First & foremost');
    expect(first?.author).toBe('Ada Lovelace');
    expect(first?.publishedAt?.toISOString()).toBe('2026-08-10T09:00:00.000Z');
    expect(first?.text).not.toContain('steal');
    expect(first?.contentHash).toHaveLength(64);
    expect(first?.normalizedText).toBe('Summary with markup and');
    expect(first?.images.map((image) => image.url).sort()).toEqual([
      'https://cdn.feed.test/one.jpg',
      'https://cdn.feed.test/thumb.jpg',
      'https://feed.test/img/one.png',
    ]);

    const source = await prisma.source.findUniqueOrThrow({ where: { id: datedSourceId } });
    expect(source.lastCursor).toContain('2026-08-11T09:00:00.000Z');
    expect(source.lastIngestedAt).not.toBeNull();
  });

  it('creates no duplicate rows when the same feed is ingested again', async () => {
    await ingest(undatedSourceId);
    const afterFirst = await prisma.sourceItem.count({ where: { sourceId: undatedSourceId } });

    await ingest(undatedSourceId);
    const afterSecond = await prisma.sourceItem.count({ where: { sourceId: undatedSourceId } });

    expect(afterFirst).toBe(2);
    expect(afterSecond).toBe(2);
  });

  it('isolates a broken source and records a typed failure', async () => {
    await expect(ingest(brokenSourceId)).rejects.toBeTruthy();

    const failure = await prisma.sourceHealthSnapshot.findFirst({
      where: { sourceId: brokenSourceId },
      orderBy: { checkedAt: 'desc' },
    });
    expect(failure?.status).toBe('FAILED');
    expect(failure?.errorCategory).toBe('UPSTREAM_UNAVAILABLE');
    expect(failure?.httpStatus).toBe(503);

    // The healthy sources are untouched by the failing one.
    expect(await prisma.sourceItem.count({ where: { sourceId: datedSourceId } })).toBe(2);
    expect(await prisma.sourceItem.count({ where: { sourceId: undatedSourceId } })).toBe(2);

    const healthy = await prisma.sourceHealthSnapshot.findFirst({
      where: { sourceId: datedSourceId },
      orderBy: { checkedAt: 'desc' },
    });
    expect(healthy?.status).toBe('HEALTHY');
  });

  it('reports adapter health through the API', async () => {
    const probe = await request(app.getHttpServer())
      .get(`/api/v1/channels/${channelId}/sources/${datedSourceId}/health`)
      .set('x-actor-id', ownerId)
      .expect(200);

    expect(probe.body.status).toBe('HEALTHY');
    expect(probe.body.httpStatus).toBe(200);
    expect(probe.body.errorCategory).toBeNull();
  });

  it('collapses repeated manual triggers onto a single queued job', async () => {
    const first = await request(app.getHttpServer())
      .post(`/api/v1/channels/${channelId}/sources/${datedSourceId}/ingest`)
      .set('x-actor-id', ownerId)
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/channels/${channelId}/sources/${datedSourceId}/ingest`)
      .set('x-actor-id', ownerId)
      .expect(201);

    expect(first.body.jobId).toBe(second.body.jobId);
  });

  it('triggers every enabled source of a channel independently', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/channels/${channelId}/sources/ingest`)
      .set('x-actor-id', ownerId)
      .expect(201);

    expect(response.body).toHaveLength(3);
    expect(
      response.body.every((entry: { jobId: string | null }) => entry.jobId !== null),
    ).toBe(true);
  });

  it('stops ingesting a disabled binding without deleting the source', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/channels/${channelId}/sources/${undatedSourceId}`)
      .set('x-actor-id', ownerId)
      .send({ enabled: false })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/channels/${channelId}/sources/${undatedSourceId}/ingest`)
      .set('x-actor-id', ownerId)
      .expect(404);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/channels/${channelId}/sources`)
      .set('x-actor-id', ownerId)
      .expect(200);
    const undated = listed.body.find((item: { id: string }) => item.id === undatedSourceId);
    expect(undated.enabled).toBe(false);

    await request(app.getHttpServer())
      .patch(`/api/v1/channels/${channelId}/sources/${undatedSourceId}`)
      .set('x-actor-id', ownerId)
      .send({ enabled: true })
      .expect(200);
  });

  it('refuses to trigger a paused source', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/channels/${channelId}/sources/${undatedSourceId}`)
      .set('x-actor-id', ownerId)
      .send({ status: 'PAUSED' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/channels/${channelId}/sources/${undatedSourceId}/ingest`)
      .set('x-actor-id', ownerId)
      .expect(409);
  });
});
