import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';

/**
 * All outbound adapters live behind this boundary. Domain and application code
 * depends on ports, never on these implementations directly.
 */
@Module({
  imports: [PrismaModule, QueueModule, StorageModule],
  exports: [PrismaModule, QueueModule, StorageModule],
})
export class InfrastructureModule {}
