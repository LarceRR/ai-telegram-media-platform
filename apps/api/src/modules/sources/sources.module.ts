import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { SourcesController } from './presentation/sources.controller';
import { SourcesService } from './application/sources.service';
@Module({ imports: [SystemModule], controllers: [SourcesController], providers: [SourcesService], exports: [SourcesService] })
export class SourcesModule {}
