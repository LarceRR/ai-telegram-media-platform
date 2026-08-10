import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AppError } from '@atmp/shared';
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}
  async bootstrap(email: string, displayName: string) {
    if ((await this.prisma.user.count()) > 0) throw new AppError('CONFLICT', 'Bootstrap is already complete');
    const user = await this.prisma.user.create({ data: { email, displayName } });
    await this.prisma.auditLog.create({ data: { actorType: 'HUMAN', actorId: user.id, action: 'access.bootstrap.completed', entityType: 'User', entityId: user.id } });
    return user;
  }
  async createUser(actorId: string, email: string, displayName: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, include: { memberships: true } });
    if (!actor || actor.status !== 'ACTIVE' || !actor.memberships.some((m) => m.role === 'OWNER')) throw new AppError('FORBIDDEN', 'Owner access required');
    return this.prisma.user.create({ data: { email, displayName } });
  }
}
