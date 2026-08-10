import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { ChannelsService } from '../application/channels.service';
import { actorExternalId, AddMemberDto, CreateChannelDto, UpdateChannelDto, UpdateSettingsDto, UpsertCredentialReferenceDto } from './dto/channel.dto';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post()
  create(@Headers() headers: Record<string, unknown>, @Body() dto: CreateChannelDto) {
    const actor = actorExternalId(headers);
    return this.channels.create(actor, String(headers['x-user-name'] ?? actor), dto);
  }

  @Get()
  list(@Headers() headers: Record<string, unknown>) { return this.channels.list(actorExternalId(headers)); }

  @Get(':id')
  get(@Headers() headers: Record<string, unknown>, @Param('id') id: string) { return this.channels.get(actorExternalId(headers), id); }

  @Patch(':id')
  update(@Headers() headers: Record<string, unknown>, @Param('id') id: string, @Body() dto: UpdateChannelDto) { return this.channels.update(actorExternalId(headers), id, dto); }

  @Patch(':id/settings')
  updateSettings(@Headers() headers: Record<string, unknown>, @Param('id') id: string, @Body() dto: UpdateSettingsDto) { return this.channels.updateSettings(actorExternalId(headers), id, dto); }

  @Post(':id/members')
  addMember(@Headers() headers: Record<string, unknown>, @Param('id') id: string, @Body() dto: AddMemberDto) { return this.channels.addMember(actorExternalId(headers), id, dto); }

  @Post(':id/credentials')
  credential(@Headers() headers: Record<string, unknown>, @Param('id') id: string, @Body() dto: UpsertCredentialReferenceDto) { return this.channels.upsertCredential(actorExternalId(headers), id, dto); }
}
