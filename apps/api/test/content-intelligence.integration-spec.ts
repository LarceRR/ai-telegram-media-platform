import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { DiscoveryService } from '../src/modules/content-intelligence/application/discovery.service';

describe('content intelligence exit gate (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let discovery: DiscoveryService;
  let channelId: string;
  let sourceId: string;
  let firstItemId: string;
  let secondItemId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    discovery = app.get(DiscoveryService);

    const unique = Date.now();
    const owner = await prisma.user.create({
      data: { email: `m3-exit-${unique}@test.local`, displayName: 'M3 exit owner' },
      select: { id: true },
    });
    const channel = await prisma.channel.create({
      data: {
        telegramId: `tg-m3-exit-${unique}`,
        title: 'M3 exit channel',
        language: 'en',
        createdById: owner.id,
        members: { create: { userId: owner.id, role: 'OWNER' } },
      },
      select: { id: true },
    });
    channelId = channel.id;
    const source = await prisma.source.create({
      data: { name: 'M3 fixture source', type: 'RSS', url: `https://m3-exit.test/${unique}.xml` },
      select: { id: true },
    });
    sourceId = source.id;
    await prisma.channelSource.create({ data: { channelId, sourceId } });

    const first = await prisma.sourceItem.create({
      data: {
        sourceId,
        externalItemId: 'm3-first',
        canonicalUrl: 'https://m3-exit.test/story',
        contentHash: '1'.repeat(64),
        title: 'Central bank raises the key rate',
        text: 'The central bank raised the key rate to five percent, citing persistent inflation.',
        normalizedText: 'The central bank raised the key rate to five percent citing persistent inflation',
      },
      select: { id: true },
    });
    firstItemId = first.id;
    const second = await prisma.sourceItem.create({
      data: {
        sourceId,
        externalItemId: 'm3-second',
        canonicalUrl: 'https://m3-exit.test/story-follow-up',
        contentHash: '2'.repeat(64),
        title: 'Central bank raises the key rate',
        text: 'The central bank has raised the key rate to five percent, citing persistent inflation.',
        normalizedText: 'The central bank has raised the key rate to five percent citing persistent inflation',
      },
      select: { id: true },
    });
    secondItemId = second.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('runs source item to idea to story, blocks a semantic duplicate, and is idempotent', async () => {
    const firstRun = await discovery.discover(channelId, sourceId, [firstItemId]);
    expect(firstRun).toHaveLength(1);
    expect(firstRun[0]?.decision).toBe('NEW');
    expect(firstRun[0]?.storyId).toBeTruthy();

    const duplicateRun = await discovery.discover(channelId, sourceId, [secondItemId]);
    expect(duplicateRun).toHaveLength(1);
    expect(duplicateRun[0]?.decision).toBe('DUPLICATE');
    expect(duplicateRun[0]?.storyId).toBeUndefined();

    const replay = await discovery.discover(channelId, sourceId, [firstItemId]);
    expect(replay[0]?.ideaId).toBe(firstRun[0]?.ideaId);
    expect(await prisma.contentIdea.count({ where: { channelId } })).toBe(2);
    expect(await prisma.story.count({ where: { channelId } })).toBe(1);
    expect(await prisma.storySourceItem.count({ where: { story: { channelId } } })).toBe(1);

    const rejected = await prisma.contentIdea.findUniqueOrThrow({ where: { id: duplicateRun[0]!.ideaId } });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectionReason).toBeTruthy();
  });
});
