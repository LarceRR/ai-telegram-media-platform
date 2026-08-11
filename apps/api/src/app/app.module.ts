import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '../common/config.module';
import { CorrelationIdMiddleware } from '../common/correlation-id.middleware';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { AccessModule } from '../modules/access/access.module';
import { ChannelsModule } from '../modules/channels/channels.module';
import { SourcesModule } from '../modules/sources/sources.module';
import { SystemModule } from '../modules/system/system.module';
@Module({ imports: [ConfigModule, InfrastructureModule, SystemModule, AccessModule, ChannelsModule, SourcesModule] })
export class AppModule implements NestModule { configure(consumer: MiddlewareConsumer): void { consumer.apply(CorrelationIdMiddleware).forRoutes('*'); } }
