import type { Job } from 'bullmq';
import { JOB_NAMES_SOURCES, ingestSourceJobSchema } from '@atmp/contracts';
import type { SourcesService } from '@atmp/api';
import type { ProcessorContext } from './index';
export async function sourceIngestProcessor(job: Job, ctx: ProcessorContext): Promise<void> { const payload = ingestSourceJobSchema.parse(job.data); const service = ctx.context.get<SourcesService>('SourcesService' as never, { strict: false }); await service.process(payload); if (job.name !== JOB_NAMES_SOURCES.ingestSource) throw new Error(`Unexpected job name: ${job.name}`); }
