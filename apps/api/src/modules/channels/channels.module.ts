import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { AuditLogService } from '../system/application/audit-log.service';
import { ChannelsController } from './presentation/channels.controller';
import { ChannelsService } from './application/channels.service';

@Module({
  imports: [SystemModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, AuditLogService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
