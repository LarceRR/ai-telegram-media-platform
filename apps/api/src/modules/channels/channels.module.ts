import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { ChannelsController } from './presentation/channels.controller';
import { ChannelsService } from './application/channels.service';

@Module({
  imports: [SystemModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
