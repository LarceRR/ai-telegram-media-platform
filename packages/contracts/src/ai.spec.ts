import {
  AI_CONFIG_VERSION,
  aiTaskRequestSchema,
  aiTaskResultSchema,
  aiUsageSchema,
} from './ai';

describe('AI contracts', () => {
  const base = {
    taskType: 'WRITING' as const,
    promptVersion: 'writing-v1',
    systemPrompt: 'Return JSON only.',
    userPrompt: 'Write a concise post.',
    responseSchema: 'post-draft-v1',
    correlationId: '3f0f8f6a-2b1a-4f3e-9b5c-7d8e9f0a1b2c',
  };

  it('applies safe deterministic request defaults', () => {
    const request = aiTaskRequestSchema.parse(base);
    expect(request.temperature).toBe(0);
    expect(request.maxTokens).toBe(2_000);
    expect(request.timeoutMs).toBe(60_000);
  });

  it('rejects an unbounded temperature or token budget', () => {
    expect(() => aiTaskRequestSchema.parse({ ...base, temperature: 3 })).toThrow();
    expect(() => aiTaskRequestSchema.parse({ ...base, maxTokens: 0 })).toThrow();
  });

  it('requires complete usage accounting', () => {
    expect(() => aiUsageSchema.parse({ inputTokens: 1 })).toThrow();
    expect(aiUsageSchema.parse({ inputTokens: 1, outputTokens: 2, totalTokens: 3, costUsd: null })).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
      costUsd: null,
    });
  });

  it('accepts a provider result only with usage and latency', () => {
    const result = aiTaskResultSchema.parse({
      provider: 'FAKE',
      model: 'fake-json-v1',
      output: { ok: true },
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5, costUsd: 0 },
      latencyMs: 4,
      status: 'SUCCEEDED',
      rawOutputRef: null,
    });
    expect(result.model).toBe('fake-json-v1');
  });

  it('pins the first AI configuration version', () => {
    expect(AI_CONFIG_VERSION).toBe('ai-v1');
  });
});
