# ai-telegram-media-platform

An automated editorial system for Telegram channels:
**Find -> Understand -> Verify -> Create -> Judge -> Publish -> Measure -> Learn.**

AI is free in how it writes. It is never free to invent facts. Deterministic
code owns state, rules, safety, idempotency and integrations; specialised AI
tasks own semantic decisions; a human keeps override and moderation.

Architecture and scope live in the master epic:
[[EPIC] AI-Powered Automated Telegram Media Platform](https://github.com/LarceRR/ai-telegram-media-platform/issues/3).

## Status

**M0 Foundation.** Skeleton only: no channels, sources, AI pipeline or
publishing yet. See [docs/m0-foundation.md](./docs/m0-foundation.md).

## Stack

TypeScript everywhere. NestJS modular monolith (REST API plus worker mode),
Next.js admin UI, PostgreSQL + Prisma + pgvector, Redis + BullMQ, Pino, Zod,
Docker Compose, GitHub Actions.

## Layout

    apps/api              NestJS API: presentation -> application -> domain, infra adapters
    apps/worker           BullMQ processors; boots the same codebase without HTTP
    apps/web              Next.js admin console (feature-oriented)
    packages/contracts    Zod schemas, queue names, job contracts, idempotency keys
    packages/config       Typed, fail-fast environment configuration
    packages/shared       Logger, correlation IDs, error taxonomy, shutdown
    packages/database     Single import boundary for the generated Prisma client
    prisma/               Schema and migrations (pgvector included)
    docs/adr/             Architecture decision records

## Quick start

    cp .env.example .env
    pnpm install
    pnpm infra:up
    pnpm prisma:generate && pnpm prisma:deploy
    pnpm dev:api    # :3001
    pnpm dev:worker
    pnpm dev:web    # :3000

Full runbook and smoke tests: [docs/m0-foundation.md](./docs/m0-foundation.md).

## Ground rules

- Domain and application code never imports Prisma, BullMQ, ioredis or provider
  SDKs. ESLint enforces it.
- Every job has a deterministic idempotency key. Retries must never duplicate
  content or double-send a Telegram message.
- Every machine-consumed AI output is Zod-validated. Invalid output is a typed
  failure, not a guess.
- Secrets live in the environment or a secret manager. Never in Git, logs, the
  frontend bundle or the database.
