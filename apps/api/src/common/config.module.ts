import { Global, Module } from '@nestjs/common';
import { loadEnv, type AppEnv } from '@atmp/config';
import { createLogger, type Logger } from '@atmp/shared';

export const APP_ENV = Symbol('APP_ENV');
export const APP_LOGGER = Symbol('APP_LOGGER');

/**
 * Configuration is validated once, at startup, and injected as a typed value.
 * Nothing in the codebase reads `process.env` directly.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useFactory: (): AppEnv => loadEnv(),
    },
    {
      provide: APP_LOGGER,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): Logger =>
        createLogger({
          service: 'api',
          level: env.LOG_LEVEL,
          pretty: env.NODE_ENV === 'development',
        }),
    },
  ],
  exports: [APP_ENV, APP_LOGGER],
})
export class ConfigModule {}
