# ai-telegram-media-platform

An automated editorial system for Telegram channels: **Find -> Understand -> Verify -> Create -> Judge -> Publish -> Measure -> Learn.**

## Quick start

Requirements: Node.js 20+, pnpm 9+, Docker Desktop (for PostgreSQL/Redis/MinIO).

```powershell
pnpm install
pnpm infra:up
pnpm dev:api
```

`pnpm dev:api` is the canonical API command. It builds shared packages in watch mode, generates Prisma only when `prisma/schema.prisma` changed, and starts Nest watch mode. Do not run Prisma generate manually while the API is running.

If Windows reports `EPERM` for `query_engine-windows.dll.node`, the old Node process still owns the engine. Press `Ctrl+C` in the old terminal, wait a second, then rerun `pnpm dev:api`. The normal command does not require deleting dependencies or downloading anything again.

Other commands:

```powershell
pnpm dev:web
pnpm dev:worker
pnpm prisma:studio
```
