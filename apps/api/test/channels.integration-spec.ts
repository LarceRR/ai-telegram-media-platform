import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Logger } from '@atmp/shared';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('channels and access (integration)', () => {
  let app: INestApplication;
  let ownerId: string;
  let viewerId: string;
  let channelId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    const logger = { error: jest.fn(), warn: jest.fn() } as unknown as Logger;
    app.useGlobalFilters(new AllExceptionsFilter(logger));
    await app.init();
    const unique = Date.now();
    const owner = await request(app.getHttpServer())
      .post('/api/v1/access/bootstrap')
      .send({ email: `owner-${unique}@test.local`, displayName: 'Owner' })
      .expect(201);
    ownerId = owner.body.id;
    const viewer = await request(app.getHttpServer())
      .post('/api/v1/access/users')
      .set('x-actor-id', ownerId)
      .send({ email: `viewer-${unique}@test.local`, displayName: 'Viewer' })
      .expect(201);
    viewerId = viewer.body.id;
    const channel = await request(app.getHttpServer())
      .post('/api/v1/channels')
      .set('x-actor-id', ownerId)
      .send({ telegramId: `tg-${unique}`, title: 'M1 channel', language: 'en' })
      .expect(201);
    channelId = channel.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('scopes channel reads to membership and permits owner setup', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/channels/${channelId}`)
      .set('x-actor-id', viewerId)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/channels/${channelId}/members`)
      .set('x-actor-id', ownerId)
      .send({ userId: viewerId, role: 'VIEWER' })
      .expect(201);
    const read = await request(app.getHttpServer())
      .get(`/api/v1/channels/${channelId}`)
      .set('x-actor-id', viewerId)
      .expect(200);
    expect(read.body.title).toBe('M1 channel');
  });

  it('enforces protected settings and optimistic concurrency', async () => {
    const first = await request(app.getHttpServer())
      .patch(`/api/v1/channels/${channelId}/settings`)
      .set('x-actor-id', ownerId)
      .send({ mode: 'AUTO', expectedVersion: 1 })
      .expect(200);
    expect(first.body.version).toBe(2);
    await request(app.getHttpServer())
      .patch(`/api/v1/channels/${channelId}/settings`)
      .set('x-actor-id', ownerId)
      .send({ mode: 'MODERATED', expectedVersion: 1 })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/v1/channels/${channelId}/settings`)
      .set('x-actor-id', viewerId)
      .send({ expectedVersion: 2 })
      .expect(403);
  });

  it('stores only a credential reference', async () => {
    const result = await request(app.getHttpServer())
      .put(`/api/v1/channels/${channelId}/telegram-credential`)
      .set('x-actor-id', ownerId)
      .send({ secretRef: 'secret/telegram/channel-1' })
      .expect(200);
    expect(result.body.secretRef).toBe('secret/telegram/channel-1');
    expect(result.body).not.toHaveProperty('token');
  });
});
