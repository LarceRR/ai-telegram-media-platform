import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { isStorageConfigured, type AppEnv } from '@atmp/config';
import { APP_ENV } from '../../common/config.module';

/**
 * S3-compatible storage adapter. M0 scope is configuration + readiness only;
 * large AI payloads and media move here in later milestones.
 */
@Injectable()
export class ObjectStorageService implements OnModuleDestroy {
  private client?: S3Client;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  get configured(): boolean {
    return isStorageConfigured(this.env);
  }

  get bucket(): string | undefined {
    return this.env.S3_BUCKET;
  }

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: this.env.S3_REGION,
        endpoint: this.env.S3_ENDPOINT,
        forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: this.env.S3_ACCESS_KEY_ID as string,
          secretAccessKey: this.env.S3_SECRET_ACCESS_KEY as string,
        },
      });
    }
    return this.client;
  }

  async headBucket(): Promise<void> {
    await this.getClient().send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET as string }));
  }

  onModuleDestroy(): void {
    this.client?.destroy();
    this.client = undefined;
  }
}
