import type { Job } from 'bullmq';
import { JOB_NAMES_SOURCES, ingestSourceJobSchema } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { SourcesService } from '@atmp/api';
import type { JobHandler } from './index';

/**
 * Validates before acting.
 *
 * The previous version resolved the service and ran the ingestion first and only
 * then checked the job name, so a job landing on the wrong queue was fully
 * executed before being rejected.
 */
export const sourceIngestProcessor: JobHandler = async (job: Job, { context, logger }) => {
  if (job.name !== JOB_NAMES_SOURCES.ingestSource) {
    throw new AppError('CONTRACT_VIOLATION', 'Unexpected job name on the ingestion queue', {
      jobId: job.id,
      jobName: job.name,
    });
  }

  const parsed = ingestSourceJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new AppError('CONTRACT_VIOLATION', 'Invalid ingestion payload', {
      jobId: job.id,
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  }

  const sources = context.get(SourcesService, { strict: false });
  await sources.process(parsed.data);

  logger.info(
    {
      correlationId: parsed.data.correlationId,
      sourceId: parsed.data.sourceId,
      channelId: parsed.data.channelId,
      jobId: job.id,
    },
    'source ingestion processed',
  );
};
