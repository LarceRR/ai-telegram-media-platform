import { Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { AppError } from '@atmp/shared';
import { DiscoveryService } from '../application/discovery.service';
import { MemoryService } from '../../memory/application/memory.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Controller()
export class ContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
    private readonly memory: MemoryService,
  ) {}

  @Get('ideas')
  async ideas(
    @Headers() headers: Record<string, unknown>,
    @Query('channelId') channelId: string,
  ) {
    await this.access(headers, channelId);
    return this.prisma.contentIdea.findMany({
      where: { channelId },
      orderBy: [{ rank: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  @Post('ideas/:id/reprocess')
  async reprocess(@Headers() headers: Record<string, unknown>, @Param('id') id: string) {
    const idea = await this.prisma.contentIdea.findUniqueOrThrow({
      where: { id },
      select: { channelId: true, sourceItemId: true },
    });
    await this.access(headers, idea.channelId);
    const item = await this.prisma.sourceItem.findUniqueOrThrow({
      where: { id: idea.sourceItemId },
      select: { id: true, sourceId: true },
    });
    return this.discovery.discover(idea.channelId, item.sourceId, [item.id]);
  }

  @Post('ideas/:id/archive')
  async archiveIdea(@Headers() headers: Record<string, unknown>, @Param('id') id: string) {
    const idea = await this.prisma.contentIdea.findUniqueOrThrow({
      where: { id },
      select: { channelId: true },
    });
    await this.access(headers, idea.channelId);
    await this.prisma.contentIdea.update({
      where: { id },
      data: { status: 'ARCHIVED', rejectionReason: null },
    });
    return { id, status: 'ARCHIVED' };
  }

  @Get('stories')
  async storyList(@Headers() headers: Record<string, unknown>, @Query('channelId') channelId: string) {
    await this.access(headers, channelId);
    return this.prisma.story.findMany({
      where: { channelId },
      include: { sourceItems: true },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    });
  }

  @Get('stories/:id/timeline')
  async timeline(@Headers() headers: Record<string, unknown>, @Param('id') id: string) {
    const story = await this.prisma.story.findUniqueOrThrow({
      where: { id },
      select: { channelId: true },
    });
    await this.access(headers, story.channelId);
    return this.prisma.storySourceItem.findMany({
      where: { storyId: id },
      include: { sourceItem: true },
      orderBy: { addedAt: 'asc' },
    });
  }

  @Get('stories/:id/relations')
  async relations(@Headers() headers: Record<string, unknown>, @Param('id') id: string) {
    const story = await this.prisma.story.findUniqueOrThrow({
      where: { id },
      select: { channelId: true },
    });
    await this.access(headers, story.channelId);
    return this.prisma.storyRelation.findMany({
      where: { OR: [{ fromStoryId: id }, { toStoryId: id }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('memory')
  async memoryList(@Headers() headers: Record<string, unknown>, @Query('channelId') channelId: string) {
    await this.access(headers, channelId);
    return this.prisma.memoryItem.findMany({
      where: { channelId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  @Get('memory/search')
  async memorySearch(
    @Headers() headers: Record<string, unknown>,
    @Query('channelId') channelId: string,
    @Query('q') query: string,
  ) {
    await this.access(headers, channelId);
    if (!query) throw new AppError('VALIDATION', 'q query parameter is required');
    return this.memory.search(channelId, query);
  }

  @Post('memory/:id/re-evaluate')
  async reevaluate(@Headers() headers: Record<string, unknown>, @Param('id') id: string) {
    const row = await this.prisma.memoryItem.findUniqueOrThrow({ where: { id } });
    await this.access(headers, row.channelId);
    return this.memory.classify({
      channelId: row.channelId,
      kind: row.kind,
      refId: row.refId,
      title: row.title,
      text: row.normalizedText,
      canonicalUrl: row.canonicalUrl,
      entities: row.entities,
      topics: row.topics,
    });
  }

  private async access(headers: Record<string, unknown>, channelId: string): Promise<void> {
    const actor = headers['x-actor-id'] ?? headers['x-user-id'];
    if (typeof actor !== 'string' || !channelId) {
      throw new AppError('UNAUTHORIZED', 'actor and channelId are required');
    }
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id: actor }, { email: actor }] },
      select: { id: true },
    });
    const member = user
      ? await this.prisma.channelMember.findFirst({
          where: { channelId, userId: user.id },
          select: { id: true },
        })
      : null;
    if (!member) throw new AppError('FORBIDDEN', 'Channel access denied');
  }
}
