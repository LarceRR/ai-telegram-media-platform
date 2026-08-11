import type { Job } from 'bullmq';
import type { INestApplicationContext } from '@nestjs/common';
import type { QueueName } from '@atmp/contracts';
import { JOB_NAMES, JOB_NAMES_SOURCES } from '@atmp/contracts';
import type { Logger } from '@atmp/shared';
import { healthProbeProcessor } from './health-probe.processor';
import { sourceIngestProcessor } from './source-ingest.processor';
export interface ProcessorContext {
  context: INestApplicationContext;
  logger: Logger;
}
export type JobHandler = (job: Job, ctx: ProcessorContext) => Promise<void>;
export const PROCESSORS: Record<QueueName, Record<string, JobHandler>> = {
  ingestion: { [JOB_NAMES_SOURCES.ingestSource]: sourceIngestProcessor },
  'content-intelligence': {},
  research: {},
  'generation-validation': {},
  media: {},
  publishing: {},
  analytics: {},
  optimization: {},
  maintenance: { [JOB_NAMES.systemHealthProbe]: healthProbeProcessor },
};
