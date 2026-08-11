import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import type { SourceAdapter } from './domain/source-adapter';
import { SourcesController } from './presentation/sources.controller';
import { SourcesService } from './application/sources.service';
import { HardenedHttpClient } from './infrastructure/http/hardened-http-client';
import { RssSourceAdapter } from './infrastructure/adapters/rss-source.adapter';
import { WebSourceAdapter } from './infrastructure/adapters/web-source.adapter';
import { SourceAdapterRegistry } from './infrastructure/source-adapter.registry';
import { SAFE_HTTP_CLIENT, SOURCE_ADAPTERS } from './infrastructure/source.tokens';

@Module({
  imports: [SystemModule],
  controllers: [SourcesController],
  providers: [
    { provide: SAFE_HTTP_CLIENT, useFactory: () => new HardenedHttpClient() },
    RssSourceAdapter,
    WebSourceAdapter,
    {
      // Adding a source type is a provider entry here, nothing else.
      provide: SOURCE_ADAPTERS,
      useFactory: (...adapters: SourceAdapter[]): SourceAdapter[] => adapters,
      inject: [RssSourceAdapter, WebSourceAdapter],
    },
    SourceAdapterRegistry,
    SourcesService,
  ],
  exports: [SourcesService, SourceAdapterRegistry],
})
export class SourcesModule {}
