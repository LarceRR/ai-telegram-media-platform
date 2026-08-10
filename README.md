# AI Telegram Media Platform

First vertical slice of a modular monolith for AI-assisted Telegram publishing.

## Stack

- NestJS + TypeScript
- Fastify HTTP adapter
- Pino structured JSON logs
- Vitest unit tests
- Docker and GitHub Actions CI

## Scope

This slice provides a runnable NestJS service with:

- one-channel configuration in memory;
- ingestion with canonical URL and content-hash deduplication;
- typed pipeline: discovery, writing, claim extraction, fact check, scoring and quality gate;
- deterministic FakeProvider port for future AI providers;
- moderation queue and idempotent publication records;
- health/readiness endpoints.

Persistence, Redis/ARQ workers, real Telegram delivery, and the React admin UI are deliberately next slices.

## Run

```bash
npm install
npm run start:dev
npm test
```

Or with Docker:

```bash
docker compose up --build
curl http://localhost:8000/health
```
