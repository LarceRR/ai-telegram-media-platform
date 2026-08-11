import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { canonicalizeUrl } from '@atmp/shared';
import { AppModule } from '../src/app/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { MemoryService } from '../src/modules/memory/application/memory.service';

/**
 * Real PostgreSQL, real pgvector, real HNSW index. Only the embedding model is
 * deterministic, which is the point: the cascade has to be provable without a
 * network call.
 *
 * The fixture is seeded through Prisma rather than the API. `/access/bootstrap`
 * creates the first admin and refuses to run twice, so it is a one-shot per
 * database and belongs to whichever suite runs first.
 */
describe('smart memory (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let memory: MemoryService;
  let channelId: string;

  const rateStory = {
    title: 'Central bank raises the key rate',
    text: 'The central bank raised the key rate to five percent, citing persistent inflation across the economy.',
  };

  /**
   * The same article with one function word inserted. The hash changes, the
   * meaning does not. This is exactly the gap a hash-only check leaves open.
   */
  const rateReposted = {
    title: 'Central bank raises the key rate',
    text: 'The central bank has raised the key rate to five percent, citing persistent inflation across the economy.',
  };

  /** Same subject, genuinely new material. Must not be blocked as a duplicate. */
  const rateFollowUp = {
    title: 'Central bank raises the key rate',
    text: 'The central bank raised the key rate to five percent, citing persistent inflation across the economy. Analysts expect another increase in the autumn.',
  };

  const volcano = {
    title: 'Volcano erupts in Iceland',
    text: 'A volcano erupted overnight in Iceland, grounding regional flights and closing nearby roads.',
  };

  const uuid = (): string => crypto.randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    memory = app.get(MemoryService);

    const unique = Date.now();
    const owner = await prisma.user.create({
      data: { email: `memory-owner-${unique}@test.local`, displayName: 'Memory owner' },
      select: { id: true },
    });
    const channel = await prisma.channel.create({
      data: {
        telegramId: `tg-memory-${unique}`,
        title: 'M3 channel',
        language: 'en',
        createdById: owner.id,
        members: { create: { userId: owner.id, role: 'OWNER' } },
      },
      select: { id: true },
    });
    channelId = channel.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports the first item of a channel as new', async () => {
    const classification = await memory.classify({
      channelId,
      kind: 'IDEA',
      refId: uuid(),
      ...rateStory,
    });

    expect(classification.decision).toBe('NEW');
    expect(classification.match).toBeNull();
  });

  it('stores an embedding in the contracted space', async () => {
    const refId = uuid();
    await memory.index({ channelId, kind: 'IDEA', refId, ...rateStory });

    const rows = await prisma.$queryRaw<Array<{ dims: number; model: string }>>`SELECT vector_dims(embedding) AS dims, embedding_model AS model FROM memory_items WHERE channel_id = ${channelId}::uuid AND ref_id = ${refId}::uuid`;

    expect(Number(rows[0]?.dims)).toBe(1536);
    expect(rows[0]?.model).toBe('hashed-bow-v1');
  });

  it('catches a repost that only changed a function word, which the hash misses', async () => {
    const classification = await memory.classify({
      channelId,
      kind: 'IDEA',
      refId: uuid(),
      ...rateReposted,
    });

    expect(classification.decision).toBe('DUPLICATE');
    expect(classification.method).toBe('VECTOR');
    expect(classification.match?.similarity ?? 0).toBeGreaterThan(0.9);
  });

  it('blocks an exact repost by content hash before doing any vector work', async () => {
    const classification = await memory.classify({
      channelId,
      kind: 'IDEA',
      refId: uuid(),
      ...rateStory,
    });

    expect(classification.decision).toBe('DUPLICATE');
    expect(classification.method).toBe('RULE');
    expect(classification.confidence).toBe(1);
  });

  it('lets a genuine follow-up through as an update rather than a duplicate', async () => {
    const classification = await memory.classify({
      channelId,
      kind: 'IDEA',
      refId: uuid(),
      ...rateFollowUp,
    });

    expect(classification.decision).toBe('UPDATE');
    expect(classification.explanation).toMatch(/new material/i);
  });

  it('blocks a rewrite published under the same canonical URL', async () => {
    const url = canonicalizeUrl('https://news.test/harbour?utm_source=tg');
    await memory.index({
      channelId,
      kind: 'IDEA',
      refId: uuid(),
      title: 'Harbour expansion approved',
      text: 'The port authority approved a harbour expansion programme running until the next decade.',
      canonicalUrl: url,
    });

    const classification = await memory.classify({
      channelId,
      kind: 'IDEA',
      refId: uuid(),
      title: 'Harbour programme signed off',
      text: 'Officials signed off the dockside works, with construction starting after the summer season.',
      canonicalUrl: canonicalizeUrl('https://www.news.test/harbour/?utm_medium=feed'),
    });

    expect(classification.decision).toBe('DUPLICATE');
    expect(classification.method).toBe('RULE');
    expect(classification.explanation).toMatch(/canonical url/i);
  });

  it('lets an unrelated story through', async () => {
    const classification = await memory.classify({
      channelId,
      kind: 'IDEA',
      refId: uuid(),
      ...volcano,
    });

    expect(classification.decision).toBe('NEW');
  });

  it('re-indexing the same reference refreshes memory instead of duplicating it', async () => {
    const refId = uuid();
    const first = await memory.index({ channelId, kind: 'STORY', refId, ...volcano });
    const second = await memory.index({
      channelId,
      kind: 'STORY',
      refId,
      title: 'Volcano erupts in Iceland, flights resume',
      text: 'Regional flights resumed after the eruption in Iceland eased overnight.',
    });

    expect(second).toBe(first);
    expect(await prisma.memoryItem.count({ where: { channelId, refId } })).toBe(1);
  });

  it('stops matching an archived item without deleting it', async () => {
    const refId = uuid();
    const subject = {
      channelId,
      kind: 'IDEA' as const,
      refId,
      title: 'Regional library reopens',
      text: 'The regional library reopened its reading rooms after a two year refurbishment programme.',
    };
    await memory.index(subject);
    await memory.archive(channelId, 'IDEA', refId);

    const classification = await memory.classify({ ...subject, refId: uuid() });

    expect(classification.decision).toBe('NEW');
    expect(await prisma.memoryItem.count({ where: { channelId, refId } })).toBe(1);
  });

  it('persists every decision with its method, confidence and explanation', async () => {
    const classification = await memory.classify({
      channelId,
      kind: 'IDEA',
      refId: uuid(),
      ...rateStory,
    });
    const id = await memory.recordDecision({ channelId, classification });

    const stored = await prisma.memoryDecisionLog.findUniqueOrThrow({ where: { id } });
    expect(stored.decision).toBe(classification.decision);
    expect(stored.method).toBe(classification.method);
    expect(stored.explanation.length).toBeGreaterThan(0);
    expect(stored.configVersion).toBe('memory-v1');
  });

  it('ranks a free-text search by cosine distance', async () => {
    const results = await memory.search(channelId, 'volcano eruption in Iceland flights', 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.title).toMatch(/volcano/i);
  });
});
