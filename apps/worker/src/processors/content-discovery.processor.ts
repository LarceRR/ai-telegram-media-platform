import type { Job } from 'bullmq';
import { discoverIdeasJobSchema, JOB_NAMES_CONTENT } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { DiscoveryService } from '@atmp/api';
import type { JobHandler } from './index';

export const contentDiscoveryProcessor: JobHandler = async (job: Job, { context, logger }) => {
  if (job.name !== JOB_NAMES_CONTENT.discoverIdeas) {
    throw new AppError('CONTRACT_VIOLATION', 'Unexpected job name on content-intelligence queue', { jobName: job.name, jobId: job.id });
  }
  const parsed = discoverIdeasJobSchema.safeParse(job.data);
  if (!parsed.success) throw new AppError('CONTRACT_VIOLATION', 'Invalid discovery payload', { issues: parsed.error.issues });
  const discovery = context.get(DiscoveryService, { strict: false });
  const results = await discovery.discover(parsed.data.channelId, parsed.data.sourceId, parsed.data.sourceItemIds);
  logger.info({ correlationId: parsed.data.correlationId, channelId: parsed.data.channelId, sourceId: parsed.data.sourceId, ideas: results.length, jobId: job.id }, 'content discovery processed');
};
