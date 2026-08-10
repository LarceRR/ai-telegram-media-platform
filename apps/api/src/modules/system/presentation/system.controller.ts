import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Liveness, Readiness, SystemMetrics } from '@atmp/contracts';
import { JOB_NAMES, idempotencyKeys } from '@atmp/contracts';
import { AuditActorType } from '@atmp/database';
import { newCorrelationId } from '@atmp/shared';
import type { Request } from 'express';
import { QueueRegistry } from '../../../infrastructure/queue/queue.registry';
import { AuditLogService } from '../application/audit-log.service';
import { HealthService } from '../application/health.service';
import { EnqueueHealthProbeDto } from './dto/enqueue-health-probe.dto';

@Controller('system')
export class SystemController {
  constructor(
    private readonly health: HealthService,
    private readonly queues: QueueRegistry,
    private readonly audit: AuditLogService,
  ) {}

  @Get('health')
  getHealth(): Liveness {
    return this.health.liveness();
  }

  @Get('readiness')
  getReadiness(@Req() req: Request): Promise<Readiness> {
    return this.health.readiness(req.correlationId ?? newCorrelationId());
  }

  @Get('metrics')
  getMetrics(): Promise<SystemMetrics> {
    return this.health.metrics();
  }

  @Get('config')
  getConfig(): Record<string, unknown> {
    return this.health.configSnapshot();
  }

  /**
   * End-to-end wiring probe: API -> Redis -> worker -> PostgreSQL audit row.
   * Re-posting the same probeId is a no-op thanks to the deterministic job id.
   */
  @Post('probe')
  @HttpCode(202)
  async enqueueProbe(
    @Req() req: Request,
    @Body() body: EnqueueHealthProbeDto,
  ): Promise<{ jobId: string; probeId: string; correlationId: string }> {
    const correlationId = req.correlationId ?? newCorrelationId();
    const probeId = body.probeId ?? correlationId;

    const jobId = await this.queues.enqueue(
      'maintenance',
      JOB_NAMES.systemHealthProbe,
      {
        correlationId,
        enqueuedAt: new Date().toISOString(),
        enqueuedBy: 'api' as const,
        attemptHint: 0,
        probeId,
        ...(body.note ? { note: body.note } : {}),
      },
      idempotencyKeys.healthProbe(probeId),
    );

    await this.audit.record({
      actorType: AuditActorType.SYSTEM,
      action: 'system.health_probe.enqueued',
      entityType: 'HealthProbe',
      entityId: probeId,
      correlationId,
      metadata: { jobId, queue: 'maintenance' },
    });

    return { jobId, probeId, correlationId };
  }
}
