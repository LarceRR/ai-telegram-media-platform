import { Module } from '@nestjs/common';
import { AuditLogService } from './application/audit-log.service';
import { HealthService } from './application/health.service';
import { SystemController } from './presentation/system.controller';

/**
 * Operational module: health, readiness, metrics, config diagnostics, audit.
 * Owns no business state and never logs secrets.
 */
@Module({
  controllers: [SystemController],
  providers: [HealthService, AuditLogService],
  exports: [HealthService, AuditLogService],
})
export class SystemModule {}
