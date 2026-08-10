import { Injectable } from '@nestjs/common';
import { AuditActorType } from '@atmp/database';
import type { Prisma } from '@atmp/database';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface RecordAuditInput {
  actorType: AuditActorType;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
}

/** Append-only audit writes. Nothing in this codebase updates or deletes them. */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditInput): Promise<string> {
    const entry = await this.prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        correlationId: input.correlationId ?? null,
        metadata: input.metadata ?? undefined,
      },
      select: { id: true },
    });
    return entry.id;
  }
}
