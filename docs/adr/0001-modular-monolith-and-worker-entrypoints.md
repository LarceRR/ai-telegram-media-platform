# ADR-0001: Modular monolith and worker entrypoints

- Status: Accepted
- Date: 2026-08-10
- Milestone: M0

## Context

The platform needs an HTTP API, an admin UI and a large amount of background
processing (ingestion, discovery, research, generation, publishing, analytics).
Splitting that into services on day one would buy distributed failure modes and
operational overhead long before it buys scaling.

## Decision

One TypeScript codebase, deployed as multiple processes.

- `apps/api` owns the NestJS modules: presentation, application, domain and
  infrastructure adapters.
- `apps/worker` is an entrypoint, not a service. It boots the same codebase via
  `createWorkerContext()`, which builds a Nest application context without an
  HTTP server, then attaches BullMQ workers that resolve application services
  from that context.
- `apps/web` is a separate Next.js app that talks to the API over REST only.
- Shared, transport-agnostic code lives in `packages/*`
  (`contracts`, `config`, `shared`, `database`).

Dependency direction is enforced, not merely documented:

- Domain and application code never imports NestJS HTTP, Prisma, BullMQ,
  ioredis, the Telegram SDK or any provider SDK. An ESLint
  `no-restricted-imports` rule fails the build if it happens.
- `@atmp/database` is the single import boundary for the generated Prisma client
  and is infrastructure-only.

## Consequences

Positive:

- One language, one build, one test suite, one deployment story.
- Application services are reused by HTTP and jobs with zero duplication.
- Extracting a service later means promoting an existing interface plus a queue
  boundary, not untangling a God module.

Negative / cost:

- Module boundaries depend on discipline plus lint rules; a careless import can
  still create coupling that only review catches.
- `apps/worker` depends on the built output of `apps/api`, so build order
  matters (pnpm resolves it topologically).
- A single codebase means a bad deploy affects both processes; independent
  scaling is possible, independent release cadence is not.

## Alternatives rejected

- **Microservices per pipeline stage.** Rejected for MVP: distributed tracing,
  contracts and failure handling cost more than the throughput problem we have.
- **A separate Python AI service.** Explicitly out of scope. Two runtimes, two
  dependency stories and duplicated contracts for no gain.
- **Worker as a fully separate codebase.** Rejected: application logic would be
  duplicated or forced into a package before its boundaries are understood.
