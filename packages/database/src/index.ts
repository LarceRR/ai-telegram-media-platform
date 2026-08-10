/**
 * Single import boundary for the generated Prisma client.
 *
 * Only infrastructure adapters may depend on this package. Domain and
 * application code depends on repository ports instead (see ADR-0001).
 */
export * from '../generated/client';
export { Prisma, PrismaClient } from '../generated/client';
