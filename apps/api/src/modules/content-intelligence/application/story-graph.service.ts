import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { jaccard } from '@atmp/shared';
import type { StoryRelationType } from '@atmp/contracts';

export interface AttachIdeaResult { storyId: string; relation: StoryRelationType | null; confidence: number; }

@Injectable()
export class StoryGraphService {
  constructor(private readonly prisma: PrismaService) {}

  async attachIdea(input: {
    channelId: string; ideaId: string; title: string; summary: string;
    entities: readonly string[]; topics: readonly string[];
    decision: 'NEW' | 'RELATED' | 'UPDATE' | 'DUPLICATE';
  }): Promise<AttachIdeaResult> {
    const stories = await this.prisma.story.findMany({ where: { channelId: input.channelId, status: 'ACTIVE' }, orderBy: { lastSeenAt: 'desc' }, take: 50 });
    let best = stories[0];
    let bestOverlap = 0;
    for (const story of stories) {
      const overlap = jaccard([...input.entities, ...input.topics], [...story.entities, ...story.topics]);
      if (overlap > bestOverlap) { best = story; bestOverlap = overlap; }
    }
    const sameStory = best && bestOverlap >= 0.34;
    const story = sameStory ? await this.prisma.story.update({
      where: { id: best.id },
      data: { lastSeenAt: new Date(), itemCount: { increment: 1 }, entities: union(best.entities, input.entities), topics: union(best.topics, input.topics), summary: input.summary },
    }) : await this.prisma.story.create({
      data: { channelId: input.channelId, title: input.title, summary: input.summary, entities: [...input.entities], topics: [...input.topics], itemCount: 1 },
    });
    await this.prisma.contentIdea.update({ where: { id: input.ideaId }, data: { storyId: story.id } });
    const sourceItem = await this.prisma.contentIdea.findUniqueOrThrow({ where: { id: input.ideaId }, select: { sourceItemId: true } });
    await this.prisma.storySourceItem.upsert({ where: { storyId_sourceItemId: { storyId: story.id, sourceItemId: sourceItem.sourceItemId } }, create: { storyId: story.id, sourceItemId: sourceItem.sourceItemId }, update: {} });
    if (!sameStory) return { storyId: story.id, relation: null, confidence: 1 };
    const relation: StoryRelationType = input.decision === 'UPDATE' ? 'UPDATE' : input.decision === 'RELATED' ? 'RELATED' : 'CONTINUATION';
    const prior = best;
    if (prior && prior.id !== story.id) await this.prisma.storyRelation.upsert({ where: { fromStoryId_toStoryId_type: { fromStoryId: story.id, toStoryId: prior.id, type: relation } }, create: { fromStoryId: story.id, toStoryId: prior.id, type: relation, method: 'RULE', confidence: bestOverlap, evidence: { entityTopicOverlap: bestOverlap } }, update: { confidence: bestOverlap, evidence: { entityTopicOverlap: bestOverlap } } });
    return { storyId: story.id, relation, confidence: bestOverlap };
  }
}

function union(left: readonly string[], right: readonly string[]): string[] { return [...new Set([...left, ...right])]; }
