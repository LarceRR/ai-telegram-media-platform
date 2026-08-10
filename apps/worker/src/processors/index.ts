import type { Job } from 'bullmq';
import type { INestApplicationContext } from '@nestjs/common';
import type { QueueName } from '@atmp/contracts';
import { JOB_NAMES } from '@atmp/contracts';
import type { Logger } from '@atmp/shared';
import { healthProbeProcessor } from './health-probe.processor';

export interface ProcessorContext {
  context: INestApplicationContext;
  logger: Logger;
}

export type JobHandler = (job: Job, ctx: ProcessorContext) => Promise<void>;

/**
 * Processor registry. Pipeline stages are added here per milestone; the queue
 * set itself stays fixed in @atmp/contracts.
 */
export const PROCESSORS: Record<QueueName, Record<string, JobHandler>> = {
  ingestion: {},
  'content-intelligence': {},
  research: {},
  'generation-validation': {},
  media: {},
  publishing: {},
  analytics: {},
  optimization: {},
  maintenance: {
    [JOB_NAMES.systemHealthProbe]: healthProbeProcessor,
  },
};
