import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app/app.module';
import { FakeAIProvider } from '../src/modules/ai/infrastructure/fake.provider';
import { validatePostDraft } from '../src/modules/ai/domain/writing-validator';
import { validateScoringResult } from '../src/modules/ai/domain/scoring-validator';
import { decideResearch } from '../src/modules/research/domain/research-decision';

describe('M4 AI pipeline exit gate', () => {
  it('runs research, validates structured writing and validates five scores without a provider call', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const fake = moduleRef.get(FakeAIProvider);
    const research = decideResearch({ risk: 'HIGH', hasContradiction: false, sourceCount: 2, claimCount: 3 });
    expect(research.level).toBe(2);
    const result = await fake.run({ taskType: 'WRITING', model: 'fake-json-v1', promptVersion: 'writing-v1', systemPrompt: 'json', userPrompt: 'fixture', responseSchema: 'post-draft-v1', temperature: 0, maxTokens: 100, timeoutMs: 1000, correlationId: '3f0f8f6a-2b1a-4f3e-9b5c-7d8e9f0a1b2c' });
    expect(result.usage.costUsd).toBe(0);
    const draft = validatePostDraft({ title: 'Verified update', body: 'The bank announced a decision.', claims: [{ text: 'The bank announced a decision.', status: 'SUPPORTED', evidenceIds: ['11111111-1111-4111-8111-111111111111'], confidence: 0.9 }], sourceStoryId: '22222222-2222-4222-8222-222222222222', promptVersion: 'writing-v1' });
    expect(draft.claims[0]?.evidenceIds).toHaveLength(1);
    const scores = validateScoringResult({ scores: ['INTEREST', 'QUALITY', 'EVIDENCE', 'ORIGINALITY', 'VIRALITY_POTENTIAL'].map((dimension) => ({ dimension, value: 7, rationale: 'Fixture rationale.' })), allClaimsVerified: true, configVersion: 'ai-v1' });
    expect(scores.scores).toHaveLength(5);
    await moduleRef.close();
  });
});
