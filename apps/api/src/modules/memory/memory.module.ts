import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { MemoryService } from './application/memory.service';
import { HashedEmbeddingProvider } from './infrastructure/hashed-embedding.provider';
import { MemoryRepository } from './infrastructure/memory.repository';
import { EMBEDDING_PROVIDER } from './infrastructure/memory.tokens';

/**
 * Swapping the embedding model is a single provider entry here. Nothing that
 * consumes vectors needs to change.
 */
@Module({
  imports: [SystemModule],
  providers: [
    { provide: EMBEDDING_PROVIDER, useClass: HashedEmbeddingProvider },
    MemoryRepository,
    MemoryService,
  ],
  exports: [MemoryService, EMBEDDING_PROVIDER],
})
export class MemoryModule {}
