import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AppError } from '@atmp/shared';
import { SourcesService } from '../application/sources.service';
import { CreateSourceDto, UpdateSourceDto } from './dto/source.dto';

@Controller('channels/:channelId/sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  private actor(headers: Record<string, unknown>): string {
    const value = headers['x-actor-id'] ?? headers['x-user-id'];
    if (typeof value !== 'string' || value === '') {
      throw new AppError('UNAUTHORIZED', 'x-actor-id or x-user-id header is required');
    }
    return value;
  }

  @Get() list(@Headers() h: Record<string, unknown>, @Param('channelId') channelId: string) {
    return this.sources.list(this.actor(h), channelId);
  }

  @Post() create(
    @Headers() h: Record<string, unknown>,
    @Param('channelId') channelId: string,
    @Body() dto: CreateSourceDto,
  ) {
    return this.sources.create(this.actor(h), channelId, dto);
  }

  @Patch(':id') update(
    @Headers() h: Record<string, unknown>,
    @Param('channelId') channelId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSourceDto,
  ) {
    return this.sources.update(this.actor(h), channelId, id, dto);
  }

  @Post('ingest') ingestAll(
    @Headers() h: Record<string, unknown>,
    @Param('channelId') channelId: string,
  ) {
    return this.sources.ingestAll(this.actor(h), channelId);
  }

  @Post(':id/ingest') ingest(
    @Headers() h: Record<string, unknown>,
    @Param('channelId') channelId: string,
    @Param('id') id: string,
  ) {
    return this.sources.enqueue(this.actor(h), channelId, id);
  }

  @Get(':id/health') health(
    @Headers() h: Record<string, unknown>,
    @Param('channelId') channelId: string,
    @Param('id') id: string,
  ) {
    return this.sources.health(this.actor(h), channelId, id);
  }
}
