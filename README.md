# ai-telegram-media-platform

An automated editorial system for Telegram channels: **Find -> Understand -> Verify -> Create -> Judge -> Publish -> Measure -> Learn.**

## Status

**M2 Sources and ingestion: complete.** [PR #7](https://github.com/LarceRR/ai-telegram-media-platform/pull/7) delivers RSS/web adapters, hardened SSRF controls, cursoring, normalized persistence, deduplication, health snapshots, per-source failure isolation and the source management UI. ADR-005 is accepted.

M1 Channels and access remains shipped. M3 Content intelligence is next.

## Stack

TypeScript everywhere. NestJS modular monolith (REST API plus worker mode), Next.js admin UI, PostgreSQL + Prisma + pgvector, Redis + BullMQ, Pino, Zod.

## Ground rules

- Domain and application code never import provider SDKs directly.
- Every job has a deterministic idempotency key.
- Every machine-consumed output is schema-validated.
- Secrets live in the environment or a secret manager, never in Git, logs, frontend bundles or unnecessary database fields.

See [docs/m2-sources-ingestion.md](./docs/m2-sources-ingestion.md), [docs/adr/0005-source-adapter-architecture-and-ssrf-controls.md](./docs/adr/0005-source-adapter-architecture-and-ssrf-controls.md) and the [M2 PR](https://github.com/LarceRR/ai-telegram-media-platform/pull/7).
