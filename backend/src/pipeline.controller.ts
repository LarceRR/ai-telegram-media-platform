import { Body, Controller, Get, Param, Post as HttpPost } from '@nestjs/common';
import { IsISO8601, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { PipelineService, SourceItem } from './pipeline.service';

class IngestDto {
  @IsUrl() url!: string;
  @IsString() @MinLength(1) @MaxLength(500) title!: string;
  @IsString() @MinLength(1) body!: string;
  @IsOptional() @IsISO8601() publishedAt?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
}

@Controller('api/v1')
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @HttpPost('ingest') ingest(@Body() body: IngestDto) {
    const item: SourceItem = { id: crypto.randomUUID(), url: body.url, title: body.title, body: body.body, publishedAt: body.publishedAt ?? new Date().toISOString(), imageUrl: body.imageUrl };
    return this.pipeline.process(item);
  }

  @Get('moderation') moderation() { return this.pipeline.moderationQueue(); }
  @HttpPost('posts/:postId/publish') publish(@Param('postId') postId: string) { return this.pipeline.publish(postId); }
}
