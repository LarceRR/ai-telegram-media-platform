import { Body, Controller, Get, Headers, Param, Patch } from '@nestjs/common';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}
  @Get(':id') get(@Param('id') id: string, @Headers('x-actor-id') actorId?: string) { return this.posts.get(id, actorId ?? ''); }
  @Patch(':id') edit(@Param('id') id: string, @Headers('x-actor-id') actorId?: string, @Body() body: { body?: string; source?: string }) { return this.posts.edit(id, actorId ?? '', body.body ?? '', body.source ?? 'HUMAN'); }
}
