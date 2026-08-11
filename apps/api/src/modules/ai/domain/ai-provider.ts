import type { AITaskRequest, AITaskResult, AIErrorCategory } from '@atmp/contracts';

export interface AIProvider {
  readonly name: string;
  run(request: AITaskRequest): Promise<AITaskResult>;
}

export class AIProviderError extends Error {
  constructor(
    public readonly category: AIErrorCategory,
    message: string,
    public readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options as ErrorOptions);
    this.name = 'AIProviderError';
  }
}

export function classifyHttpFailure(status: number): { category: AIErrorCategory; retryable: boolean } {
  if (status === 401 || status === 403) return { category: 'AUTHENTICATION', retryable: false };
  if (status === 408 || status === 504) return { category: 'TIMEOUT', retryable: true };
  if (status === 429) return { category: 'RATE_LIMITED', retryable: true };
  if (status >= 500) return { category: 'UPSTREAM_UNAVAILABLE', retryable: true };
  return { category: 'PROVIDER_ERROR', retryable: false };
}
