import { Body, Controller, Get, Headers, Param, Patch, Post, Put } from '@nestjs/common';
import { ChannelsService } from '../application/channels.service';
import { AddMemberDto, CreateChannelDto, CredentialRefDto, UpdateChannelDto, UpdateSettingsDto } from './dto/channel.dto';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}
  private actor(headers: Record<string, string | string[] | undefined>): string {
    const value = headers['x-actor-id'];
    const actorId = Array.isArray(value) ? value[0] : value;
    if (!actorId) throw new Error('x-actor-id header is required');
    return actorId;
  }
  @Post() create(@Headers() headers: Record<string, string | string[] | undefined>, @Body() dto: CreateChannelDto) { return this.channels.create(this.actor(headers), dto); }
  @Get() list(@Headers() headers: Record<string, string | string[] | undefined>) { return this.channels.list(this.actor(headers)); }
  @Get(':id') get(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string) { return this.channels.get(this.actor(headers), id); }
  @Patch(':id') update(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string, @Body() dto: UpdateChannelDto) { return this.channels.update(this.actor(headers), id, dto); }
  @Patch(':id/settings') updateSettings(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string, @Body() dto: UpdateSettingsDto) { return this.channels.updateSettings(this.actor(headers), id, dto); }
  @Post(':id/members') addMember(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string, @Body() dto: AddMemberDto) { return this.channels.addMember(this.actor(headers), id, dto); }
  @Put(':id/telegram-credential') setCredential(@Headers() headers: Record<string, string | string[] | undefined>, @Param('id') id: string, @Body() dto: CredentialRefDto) { return this.channels.setCredential(this.actor(headers), id, dto); }
}
