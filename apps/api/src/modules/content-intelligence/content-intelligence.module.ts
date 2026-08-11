import { Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { DiscoveryService } from './application/discovery.service';
import { StoryGraphService } from './application/story-graph.service';
import { ContentController } from './presentation/content.controller';

@Module({ imports: [MemoryModule], controllers: [ContentController], providers: [DiscoveryService, StoryGraphService], exports: [DiscoveryService, StoryGraphService] })
export class ContentIntelligenceModule {}
