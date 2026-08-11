import { Body, Controller, Get, Headers, Param, Patch, Post, Put } from '@nestjs/common';
import { ChannelsService } from '../application/channels.service';
import {
  AddMemberDto,
  CreateChannelDto,
  CredentialRefDto,
  UpdateChannelDto,
  UpdateSettingsDto,
} from './dto/channel.dto';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}
  private actor(headers: Record<string, unknown>): string {
    const value = headers['x-actor-id'] ?? headers['x-user-id'];
    if (typeof value !== 'string' || value.length < 1) throw new Error('actor header is required');
    return value;
  }
  @Post() create(@Headers() h: Record<string, unknown>, @Body() dto: CreateChannelDto) {
    return this.channels.create(this.actor(h), String(h['x-user-name'] ?? this.actor(h)), dto);
  }
  @Get() list(@Headers() h: Record<string, unknown>) {
    return this.channels.list(this.actor(h));
  }
  @Get(':id') get(@Headers() h: Record<string, unknown>, @Param('id') id: string) {
    return this.channels.get(this.actor(h), id);
  }
  @Patch(':id') update(
    @Headers() h: Record<string, unknown>,
    @Param('id') id: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channels.update(this.actor(h), id, dto);
  }
  @Patch(':id/settings') settings(
    @Headers() h: Record<string, unknown>,
    @Param('id') id: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.channels.updateSettings(this.actor(h), id, dto);
  }
  @Post(':id/members') member(
    @Headers() h: Record<string, unknown>,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.channels.addMember(this.actor(h), id, dto);
  }
  @Put(':id/telegram-credential') credential(
    @Headers() h: Record<string, unknown>,
    @Param('id') id: string,
    @Body() dto: CredentialRefDto,
  ) {
    return this.channels.setCredential(this.actor(h), id, dto);
  }
}
