import { Inject, Injectable } from '@nestjs/common';
import type { SourceType } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import type { SourceAdapter, SourceRateLimit } from '../domain/source-adapter';
import { SOURCE_ADAPTERS } from './source.tokens';

/**
 * The single place that maps a source type onto an adapter. Registration is
 * DI-driven, so a new adapter is a provider entry rather than an edit to a
 * branch in the ingestion service.
 */
@Injectable()
export class SourceAdapterRegistry {
  private readonly adapters: ReadonlyMap<SourceType, SourceAdapter>;

  constructor(@Inject(SOURCE_ADAPTERS) adapters: readonly SourceAdapter[]) {
    const registered = new Map<SourceType, SourceAdapter>();
    for (const adapter of adapters) {
      if (registered.has(adapter.type)) {
        throw new AppError('INTERNAL', `Duplicate source adapter for type "${adapter.type}"`);
      }
      registered.set(adapter.type, adapter);
    }
    this.adapters = registered;
  }

  get(type: SourceType): SourceAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new AppError('INTERNAL', `No source adapter registered for type "${type}"`, {
        supported: this.supportedTypes(),
      });
    }
    return adapter;
  }

  rateLimitFor(type: SourceType): SourceRateLimit {
    return this.get(type).rateLimit;
  }

  supportedTypes(): SourceType[] {
    return [...this.adapters.keys()];
  }
}
