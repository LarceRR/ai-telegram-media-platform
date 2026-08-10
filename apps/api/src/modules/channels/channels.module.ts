import { Module } from '@nestjs/common';
import { ChannelsController } from './presentation/channels.controller';
import { ChannelsService } from './application/channels.service';
@Module({ controllers: [ChannelsController], providers: [ChannelsService], exports: [ChannelsService] })
export class ChannelsModule {}
