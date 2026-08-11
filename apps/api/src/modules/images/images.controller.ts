import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { imageSelectionRequestSchema } from '@atmp/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ImageSelectionService } from './image-selection.service';

@Controller('source-items')
export class ImagesController {
  constructor(private readonly prisma: PrismaService, private readonly selector: ImageSelectionService) {}

  @Post(':id/images/select')
  async select(@Param('id') id: string, @Body() body: Record<string, unknown>, @Headers('x-actor-id') actor?: string) {
    const item = await this.prisma.sourceItem.findUniqueOrThrow({ where: { id }, include: { images: true } });
    const request = imageSelectionRequestSchema.parse({ ...body, sourceItemId: id });
    const candidates = request.candidates.filter((candidate) => item.images.some((image) => image.id === candidate.sourceImageId));
    const result = this.selector.select(candidates);
    await this.prisma.auditLog.create({ data: { actorType: actor ? 'HUMAN' : 'SYSTEM', actorId: actor ?? null, action: 'IMAGE_SELECTED', entityType: 'SourceItem', entityId: id, metadata: result } });
    return result;
  }
}
