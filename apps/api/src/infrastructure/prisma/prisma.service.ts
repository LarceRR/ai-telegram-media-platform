import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@atmp/database';
import type { AppEnv } from '@atmp/config';
import { APP_ENV } from '../../common/config.module';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(APP_ENV) env: AppEnv) {
    super({
      datasources: { db: { url: env.DATABASE_URL } },
      log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap readiness probe. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  /** Confirms pgvector is installed in the connected database. */
  async hasVectorExtension(): Promise<boolean> {
    const rows = await this.$queryRaw<Array<{ installed: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed
    `;
    return rows[0]?.installed === true;
  }
}
