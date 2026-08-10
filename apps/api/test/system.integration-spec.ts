import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

/**
 * Requires the local infrastructure stack: `pnpm infra:up`.
 * Verifies real PostgreSQL/pgvector, Redis and queue wiring, not mocks.
 */
describe('system endpoints (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves liveness', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/system/health').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('reports postgres, pgvector and redis as up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/system/readiness').expect(200);
    const byName = Object.fromEntries(
      response.body.checks.map((check: { name: string; status: string }) => [
        check.name,
        check.status,
      ]),
    );

    expect(byName.postgres).toBe('up');
    expect(byName.pgvector).toBe('up');
    expect(byName.redis).toBe('up');
  });

  it('enqueues a probe idempotently', async () => {
    const probeId = `int-${Date.now()}`;

    const first = await request(app.getHttpServer())
      .post('/api/v1/system/probe')
      .send({ probeId })
      .expect(202);
    const second = await request(app.getHttpServer())
      .post('/api/v1/system/probe')
      .send({ probeId })
      .expect(202);

    expect(first.body.jobId).toBe(second.body.jobId);
  });
});
