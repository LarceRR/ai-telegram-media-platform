import { Module } from '@nestjs/common';
import { ConfigModule } from '../common/config.module';
import { CorrelationIdMiddleware } from '../common/correlation-id.middleware';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { SystemModule } from '../modules/system/system.module';

/** HTTP entrypoint composition root. */
@Module({
  imports: [ConfigModule, InfrastructureModule, SystemModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
