import { Module } from '@nestjs/common';
import { ConfigModule } from '../common/config.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { SystemModule } from '../modules/system/system.module';

@Module({
  imports: [ConfigModule, InfrastructureModule, SystemModule],
})
export class WorkerModule {}
