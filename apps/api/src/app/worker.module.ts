import { Module } from '@nestjs/common';
import { ConfigModule } from '../common/config.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { SystemModule } from '../modules/system/system.module';
import { AccessModule } from '../modules/access/access.module';
import { ChannelsModule } from '../modules/channels/channels.module';
import { SourcesModule } from '../modules/sources/sources.module';
@Module({
  imports: [
    ConfigModule,
    InfrastructureModule,
    SystemModule,
    AccessModule,
    ChannelsModule,
    SourcesModule,
  ],
})
export class WorkerModule {}
