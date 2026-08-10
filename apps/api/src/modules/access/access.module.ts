import { Module } from '@nestjs/common';
import { AccessController } from './presentation/access.controller';
import { AccessService } from './application/access.service';
@Module({ controllers: [AccessController], providers: [AccessService], exports: [AccessService] })
export class AccessModule {}
