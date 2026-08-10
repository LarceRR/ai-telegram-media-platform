import { Body, Controller, Get, Headers, Param, Patch, Post, Put } from '@nestjs/common';
import { ChannelsService } from '../application/channels.service';
import { AddMemberDto, CreateChannelDto, CredentialRefDto, UpdateChannelDto, UpdateSettingsDto } from './dto/channel.dto';
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}
  private actor(headers: Record<string, string | string[] | undefined>): string { const value = headers['x-actor-id']; const actorId = Array.isArray(value) ? value[0] : value; if (!actorId) throw new Error('x-actor-id header is required'); return actorId; }
  @Post() create(@Headers() h: Record<string,string|string[]|undefined>, @Body() d: CreateChannelDto) { return this.channels.create(this.actor(h), d); }
  @Get() list(@Headers() h: Record<string,string|string[]|undefined>) { return this.channels.list(this.actor(h)); }
  @Get(':id') get(@Headers() h: Record<string,string|string[]|undefined>, @Param('id') id: string) { return this.channels.get(this.actor(h), id); }
  @Patch(':id') update(@Headers() h: Record<string,string|string[]|undefined>, @Param('id') id: string, @Body() d: UpdateChannelDto) { return this.channels.update(this.actor(h), id, d); }
  @Patch(':id/settings') updateSettings(@Headers() h: Record<string,string|string[]|undefined>, @Param('id') id: string, @Body() d: UpdateSettingsDto) { return this.channels.updateSettings(this.actor(h), id, d); }
  @Post(':id/members') addMember(@Headers() h: Record<string,string|string[]|undefined>, @Param('id') id: string, @Body() d: AddMemberDto) { return this.channels.addMember(this.actor(h), id, d); }
  @Put(':id/telegram-credential') setCredential(@Headers() h: Record<string,string|string[]|undefined>, @Param('id') id: string, @Body() d: CredentialRefDto) { return this.channels.setCredential(this.actor(h), id, d); }
}
