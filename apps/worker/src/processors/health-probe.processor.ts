import type { Job } from 'bullmq';
import { healthProbeJobSchema } from '@atmp/contracts';
import { AppError } from '@atmp/shared';
import { AuditLogService } from '@atmp/api';
import { AuditActorType } from '@atmp/database';
import type { JobHandler } from './index';

/**
 * M0 wiring proof: validates its payload, resolves an application service from
 * the Nest context and writes an audit row. Invalid payloads are a contract
 * violation and must not be retried.
 */
export const healthProbeProcessor: JobHandler = async (job: Job, { context, logger }) => {
  const parsed = healthProbeJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new AppError('CONTRACT_VIOLATION', 'Invalid health probe payload', {
      jobId: job.id,
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  }

  const { correlationId, probeId, note } = parsed.data;
  const audit = context.get(AuditLogService, { strict: false });

  await audit.record({
    actorType: AuditActorType.SYSTEM,
    action: 'system.health_probe.processed',
    entityType: 'HealthProbe',
    entityId: probeId,
    correlationId,
    metadata: { jobId: job.id ?? null, attemptsMade: job.attemptsMade, note: note ?? null },
  });

  logger.info({ correlationId, probeId, jobId: job.id }, 'health probe processed');
};
