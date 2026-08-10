import { describe, expect, it } from 'vitest';
import { PipelineService, SourceItem } from '../src/pipeline.service';

const item = (body = 'A new event happened in 2026.'): SourceItem => ({ id: crypto.randomUUID(), url: 'https://example.com/story', title: 'Story', body, publishedAt: new Date().toISOString() });

describe('PipelineService', () => {
  it('deduplicates deterministically', () => { const pipeline = new PipelineService(); expect(pipeline.process(item()).duplicate).toBe(false); expect(pipeline.process(item()).duplicate).toBe(true); });
  it('routes factual claims to review', () => { const pipeline = new PipelineService(); const result = pipeline.process(item()); expect(result.decision).toBe('REVIEW'); expect(pipeline.moderationQueue()[0].claims[0].supported).toBe(false); });
  it('publishes idempotently', () => { const pipeline = new PipelineService(); const result = pipeline.process(item('A quiet editorial note without numeric claims.')); expect(pipeline.publish(result.postId!).idempotencyKey).toBe(pipeline.publish(result.postId!).idempotencyKey); });
});
