import { Module } from '@nestjs/common';
import { QualityGateController } from './quality-gate.controller';
import { QualityGateService } from './quality-gate.service';

@Module({ controllers: [QualityGateController], providers: [QualityGateService] })
export class QualityGateModule {}
