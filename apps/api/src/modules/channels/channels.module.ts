import { Module } from '@nestjs/common';
import { ChannelsController } from './presentation/channels.controller';
import { ChannelsService } from './application/channels.service';
import { AccessService } from '../access/application/access.service';

@Module({ controllers: [ChannelsController], providers: [ChannelsService, AccessService], exports: [ChannelsService] })
export class ChannelsModule {}
