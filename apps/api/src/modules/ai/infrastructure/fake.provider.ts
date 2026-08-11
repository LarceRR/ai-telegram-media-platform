import { Injectable } from '@nestjs/common';
import { type AITaskRequest, type AITaskResult } from '@atmp/contracts';
import type { AIProvider } from '../domain/ai-provider';

@Injectable()
export class FakeAIProvider implements AIProvider {
  readonly name = 'FAKE';
  async run(request: AITaskRequest): Promise<AITaskResult> {
    return { provider: 'FAKE', model: request.model ?? 'fake-json-v1', output: { ok: true, taskType: request.taskType }, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 }, latencyMs: 0, status: 'SUCCEEDED', rawOutputRef: null };
  }
}
