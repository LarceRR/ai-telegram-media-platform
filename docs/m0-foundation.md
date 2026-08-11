# M0 Foundation: scope, runbook, acceptance

## What M0 is

The skeleton every later milestone hangs on: workspace, two Node processes, the
admin shell, PostgreSQL with pgvector, Redis with BullMQ, typed configuration,
structured logging, health checks and CI.

## What M0 deliberately is not

No channels, sources, adapters, AI provider, pipeline stages, moderation or
publishing. Those are M1 through M6. The only job in the system is a health
probe whose sole purpose is to prove the API to Redis to worker to PostgreSQL
path works end to end.

## Local setup

    cp .env.example .env
    pnpm install
    pnpm infra:up            # postgres (pgvector), redis, minio + bucket
    pnpm prisma:generate
    pnpm prisma:deploy       # applies the M0 migration
    pnpm build

    pnpm dev:api             # http://localhost:3001/api/v1
    pnpm dev:worker
    pnpm dev:web             # http://localhost:3000

One manual step remains: after the first local `pnpm install`, commit the
generated `pnpm-lock.yaml` and switch CI from `--no-frozen-lockfile` to
`--frozen-lockfile`.

## Smoke test

    curl -s localhost:3001/api/v1/system/health
    curl -s localhost:3001/api/v1/system/readiness
    curl -s localhost:3001/api/v1/system/metrics

    # API -> queue -> worker -> audit row. Repeat it: the job id must not change.
    curl -s -XPOST localhost:3001/api/v1/system/probe \
      -H 'content-type: application/json' \
      -d '{"probeId":"probe-1","note":"m0 smoke"}'

The worker logs `health probe processed` and writes an `audit_log` row with the
action `system.health_probe.processed`.

## Tests

    pnpm test        # unit: config validation, job contracts, health policy
    pnpm test:int    # integration: real PostgreSQL/pgvector, Redis, queue wiring

## Acceptance checklist

| Criterion                                                               | Status |
| ----------------------------------------------------------------------- | ------ |
| No Python / FastAPI / Celery anywhere in the repo                       | done   |
| pnpm workspace with apps + packages and enforced boundaries             | done   |
| NestJS API boots with global prefix, validation, helmet, CORS allowlist | done   |
| Worker runs the same codebase as a separate process                     | done   |
| Prisma migration applies and installs pgvector                          | done   |
| Vector column, cosine operator and HNSW index verified by test          | done   |
| Redis + BullMQ queue set defined with a policy per queue                | done   |
| Deterministic idempotency keys defined for every critical stage         | done   |
| Typed configuration fails fast on invalid env                           | done   |
| Pino structured logs with correlation IDs and secret redaction          | done   |
| Consistent error envelope across the REST surface                       | done   |
| Health, readiness, metrics and config diagnostics endpoints             | done   |
| Graceful shutdown drains workers and stops accepting jobs               | done   |
| Append-only audit log written by both API and worker                    | done   |
| Docker Compose provides postgres, redis and S3-compatible storage       | done   |
| CI runs lint, format, typecheck, unit, integration, build, audit        | done   |
| Next.js admin shell reads live readiness and queue depth                | done   |

## Open questions carried into M1

Auth provider and first admin bootstrap, Telegram bot permissions and analytics
scope, deployment target and secret manager, embedding model and distance
benchmark, source list beyond RSS and generic web.
