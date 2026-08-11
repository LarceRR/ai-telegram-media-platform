import { Body, Controller, Headers, Param, Post, Get, Query } from '@nestjs/common';
import { ModerationService } from './moderation.service';

@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  queue(@Query('channelId') channelId: string, @Headers('x-actor-id') actorId?: string) {
    return this.moderation.queue(channelId, actorId ?? '');
  }

  @Post(':postId/:action')
  act(@Param('postId') postId: string, @Param('action') action: string, @Body() body: Record<string, unknown>, @Query('channelId') channelId: string, @Headers('x-actor-id') actorId?: string) {
    return this.moderation.act(postId, channelId, actorId ?? '', { ...body, action: action.toUpperCase() });
  }
}
