import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AppError } from '@atmp/shared';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(email: string, displayName: string) {
    const count = await this.prisma.user.count();
    if (count > 0) throw new AppError('CONFLICT', 'Bootstrap is already complete');
    const user = await this.prisma.user.create({ data: { email, displayName } });
    await this.prisma.auditLog.create({ data: { actorType: 'HUMAN', actorId: user.id, action: 'access.bootstrap.completed', entityType: 'User', entityId: user.id } });
    return user;
  }

  async createUser(actorId: string, email: string, displayName: string) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, include: { memberships: true } });
    if (!actor || actor.status !== 'ACTIVE') throw new AppError('FORBIDDEN', 'Owner access required');
    const isFirstAdmin = (await this.prisma.user.count()) === 1 && actor.memberships.length === 0;
    const isOwner = actor.memberships.some((membership) => membership.role === 'OWNER');
    if (!isFirstAdmin && !isOwner) throw new AppError('FORBIDDEN', 'Owner access required');
    return this.prisma.user.create({ data: { email, displayName } });
  }
}
