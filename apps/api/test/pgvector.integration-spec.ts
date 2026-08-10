import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@atmp/database';

/**
 * Proves the pgvector column, the cosine operator and the HNSW index are usable
 * before Smart Memory is built on top of them in M3.
 */
describe('pgvector (integration)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM vector_probe WHERE label LIKE 'itest-%'`;
    await prisma.$disconnect();
  });

  it('has the vector extension installed', async () => {
    const rows = await prisma.$queryRaw<Array<{ installed: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed
    `;
    expect(rows[0]?.installed).toBe(true);
  });

  it('stores embeddings and ranks them by cosine distance', async () => {
    const label = `itest-${randomUUID()}`;
    const near = `[${['1', '0', ...Array(1534).fill('0')].join(',')}]`;
    const far = `[${['0', '1', ...Array(1534).fill('0')].join(',')}]`;

    await prisma.$executeRaw`
      INSERT INTO vector_probe (id, label, embedding)
      VALUES (${randomUUID()}::uuid, ${`${label}-near`}, ${near}::vector)
    `;
    await prisma.$executeRaw`
      INSERT INTO vector_probe (id, label, embedding)
      VALUES (${randomUUID()}::uuid, ${`${label}-far`}, ${far}::vector)
    `;

    const ranked = await prisma.$queryRaw<Array<{ label: string; distance: number }>>`
      SELECT label, (embedding <=> ${near}::vector) AS distance
      FROM vector_probe
      WHERE label LIKE ${`${label}%`}
      ORDER BY embedding <=> ${near}::vector
      LIMIT 2
    `;

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.label).toBe(`${label}-near`);
    expect(Number(ranked[0]?.distance)).toBeLessThan(Number(ranked[1]?.distance));
  });

  it('writes an audit row', async () => {
    const entry = await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        action: 'system.integration_test',
        entityType: 'IntegrationTest',
        entityId: randomUUID(),
      },
      select: { id: true, createdAt: true },
    });

    expect(entry.id).toBeTruthy();
    expect(entry.createdAt).toBeInstanceOf(Date);
    await prisma.auditLog.delete({ where: { id: entry.id } });
  });
});
