import { Module } from '@nestjs/common';
import { ChannelsService } from './application/channels.service';
import { ChannelsController } from './presentation/channels.controller';

@Module({
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
