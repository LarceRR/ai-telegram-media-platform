import { Module } from '@nestjs/common';
import { HashedEmbeddingProvider } from './infrastructure/hashed-embedding.provider';
import { EMBEDDING_PROVIDER } from './infrastructure/memory.tokens';

/**
 * Swapping the embedding model is a single provider entry here. Nothing that
 * consumes vectors needs to change.
 */
@Module({
  providers: [{ provide: EMBEDDING_PROVIDER, useClass: HashedEmbeddingProvider }],
  exports: [EMBEDDING_PROVIDER],
})
export class MemoryModule {}
