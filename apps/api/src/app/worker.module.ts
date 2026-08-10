import { Module } from '@nestjs/common';
import { ConfigModule } from '../common/config.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { SystemModule } from '../modules/system/system.module';

/**
 * Worker-mode composition root: same application/domain services, no HTTP layer.
 * Controllers are intentionally never registered here.
 */
@Module({
  imports: [ConfigModule, InfrastructureModule, SystemModule],
})
export class WorkerModule {}
