import { Inject, Injectable } from '@nestjs/common';
import type { AppEnv } from '@atmp/config';
import { aiTaskResultSchema, type AITaskRequest, type AITaskResult } from '@atmp/contracts';
import { APP_ENV } from '../../../common/config.module';
import { AI_HTTP_CLIENT } from './ai.tokens';
import { AIProviderError, classifyHttpFailure } from '../domain/ai-provider';

type OpenRouterEnv = AppEnv & {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_SITE_URL?: string;
  OPENROUTER_APP_NAME: string;
};

export interface AIHttpClient { request(input: string | URL, init?: RequestInit): Promise<Response>; }

@Injectable()
export class OpenRouterProvider {
  readonly name = 'OPENROUTER';
  constructor(@Inject(APP_ENV) private readonly env: OpenRouterEnv, @Inject(AI_HTTP_CLIENT) private readonly http: AIHttpClient) {}

  async run(request: AITaskRequest): Promise<AITaskResult> {
    if (!this.env.OPENROUTER_API_KEY) throw new AIProviderError('AUTHENTICATION', 'OpenRouter API key is not configured', false);
    const started = Date.now();
    let response: Response;
    try {
      response = await this.http.request(`${this.env.OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST', headers: { authorization: `Bearer ${this.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json', ...(this.env.OPENROUTER_SITE_URL ? { 'http-referer': this.env.OPENROUTER_SITE_URL } : {}), 'x-title': this.env.OPENROUTER_APP_NAME },
        body: JSON.stringify({ model: request.model, temperature: request.temperature, max_tokens: request.maxTokens, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: request.systemPrompt }, { role: 'user', content: request.userPrompt }] }),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) { throw new AIProviderError('UPSTREAM_UNAVAILABLE', 'OpenRouter request failed', true, { cause: error }); }
    if (!response.ok) { const failure = classifyHttpFailure(response.status); throw new AIProviderError(failure.category, `OpenRouter returned HTTP ${response.status}`, failure.retryable); }
    const payload = await response.json() as { model?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number } };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new AIProviderError('INVALID_OUTPUT', 'OpenRouter returned no message content', false);
    let output: unknown;
    try { output = JSON.parse(content); } catch (error) { throw new AIProviderError('INVALID_OUTPUT', 'OpenRouter returned non-JSON content', false, { cause: error }); }
    return aiTaskResultSchema.parse({ provider: 'OPENROUTER', model: payload.model ?? request.model ?? 'unknown', output, usage: { inputTokens: payload.usage?.prompt_tokens ?? 0, outputTokens: payload.usage?.completion_tokens ?? 0, totalTokens: payload.usage?.total_tokens ?? 0, costUsd: payload.usage?.cost ?? null }, latencyMs: Date.now() - started, status: 'SUCCEEDED', rawOutputRef: null });
  }
}
