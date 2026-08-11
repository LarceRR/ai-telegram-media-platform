import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { qualityGateInputSchema } from '@atmp/contracts';
import { QualityGateService } from './quality-gate.service';

@Controller('posts')
export class QualityGateController {
  constructor(private readonly gate: QualityGateService) {}
  @Post(':id/quality-gate') evaluate(@Param('id') id: string, @Headers('x-actor-id') actorId: string | undefined, @Body() body: unknown) {
    return this.gate.evaluate(id, actorId ?? '', qualityGateInputSchema.parse(body));
  }
}
