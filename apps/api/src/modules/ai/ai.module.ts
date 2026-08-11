import { Module } from '@nestjs/common';
import { ConfigModule } from '../../common/config.module';
import { AI_PROVIDER, AI_HTTP_CLIENT } from './infrastructure/ai.tokens';
import { FakeAIProvider } from './infrastructure/fake.provider';
import { OpenRouterProvider, type AIHttpClient } from './infrastructure/openrouter.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    { provide: AI_HTTP_CLIENT, useFactory: (): AIHttpClient => ({ request: (input, init) => fetch(input, init) }) },
    OpenRouterProvider,
    FakeAIProvider,
    { provide: AI_PROVIDER, useExisting: FakeAIProvider },
  ],
  exports: [AI_PROVIDER, OpenRouterProvider, FakeAIProvider],
})
export class AIModule {}
