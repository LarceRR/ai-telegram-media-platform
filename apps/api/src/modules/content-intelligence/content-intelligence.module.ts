import { Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { DiscoveryService } from './application/discovery.service';

@Module({
  imports: [MemoryModule],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class ContentIntelligenceModule {}
