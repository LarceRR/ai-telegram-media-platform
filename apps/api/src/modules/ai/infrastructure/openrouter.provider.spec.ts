import type { AppEnv } from '@atmp/config';
import { OpenRouterProvider } from './openrouter.provider';

const env = { OPENROUTER_API_KEY: 'secret', OPENROUTER_BASE_URL: 'https://openrouter.test/api/v1', OPENROUTER_APP_NAME: 'test', OPENROUTER_SITE_URL: undefined } as unknown as AppEnv;
const request = { taskType: 'WRITING' as const, model: 'test-model', promptVersion: 'writing-v1', systemPrompt: 'json', userPrompt: 'write', responseSchema: 'draft-v1', temperature: 0, maxTokens: 100, timeoutMs: 1000, correlationId: '3f0f8f6a-2b1a-4f3e-9b5c-7d8e9f0a1b2c' };

describe('OpenRouterProvider', () => {
  it('maps a structured response and usage', async () => {
    const provider = new OpenRouterProvider(env, { request: jest.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'test-model', choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7, cost: 0.001 } }), { status: 200, headers: { 'content-type': 'application/json' } })) });
    const result = await provider.run(request);
    expect(result.output).toEqual({ ok: true });
    expect(result.usage.totalTokens).toBe(7);
  });

  it('does not leak the key in an auth error', async () => {
    const provider = new OpenRouterProvider(env, { request: jest.fn().mockResolvedValue(new Response('', { status: 401 })) });
    await expect(provider.run(request)).rejects.toMatchObject({ category: 'AUTHENTICATION', message: expect.not.stringContaining('secret') });
  });

  it('classifies rate limits as retryable', async () => {
    const provider = new OpenRouterProvider(env, { request: jest.fn().mockResolvedValue(new Response('', { status: 429 })) });
    await expect(provider.run(request)).rejects.toMatchObject({ category: 'RATE_LIMITED', retryable: true });
  });
});
