import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PipelineService } from './pipeline.service';
import { PipelineController } from './pipeline.controller';

@Module({
  controllers: [HealthController, PipelineController],
  providers: [PipelineService],
})
export class AppModule {}
