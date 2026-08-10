import { Global, Module } from '@nestjs/common';
import IORedis from 'ioredis';
import type { AppEnv } from '@atmp/config';
import { APP_ENV } from '../../common/config.module';
import { QueueRegistry, REDIS_CONNECTION } from './queue.registry';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [APP_ENV],
      useFactory: (env: AppEnv) =>
        new IORedis(env.REDIS_URL, {
          // Required by BullMQ: blocking commands must not be aborted by retries.
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          lazyConnect: false,
        }),
    },
    QueueRegistry,
  ],
  exports: [REDIS_CONNECTION, QueueRegistry],
})
export class QueueModule {}
