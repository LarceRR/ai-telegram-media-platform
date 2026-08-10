# ai-telegram-media-platform

An automated editorial system for Telegram channels: **Find -> Understand -> Verify -> Create -> Judge -> Publish -> Measure -> Learn.**

## Status

**M1 Channels and access.** Channel CRUD, membership-scoped isolation, baseline RBAC, protected settings, optimistic concurrency, Telegram credential references and audit events.

## Stack

TypeScript, NestJS, Next.js, PostgreSQL + Prisma + pgvector, Redis + BullMQ, Pino, Zod, Docker Compose, GitHub Actions.

See [docs/m1-channels-access.md](./docs/m1-channels-access.md) and the master [epic](https://github.com/LarceRR/ai-telegram-media-platform/issues/3).
