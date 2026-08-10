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

Dependency direction is enforced by ESLint `no-restricted-imports`, not by
convention alone:

- `domain/**` imports no persistence, no queues, no transport, no provider SDK.
  It is pure rules and types.
- `application/**` may reach persistence only through the `@atmp/database`
  boundary and repository-style services. Importing `@prisma/client`, `bullmq`
  or `ioredis` directly is a build failure.
- `infrastructure/**` is the only place provider SDKs, the Prisma client and
  queue clients may appear.

`@atmp/database` deliberately contains no source of its own: `main` and `types`
point at the generated Prisma client, so there is exactly one place where the
client version and its lifecycle live.

## Consequences

Positive:

- One language, one build, one test suite, one deployment story.
- Application services are reused by HTTP and jobs with zero duplication.
- Extracting a service later means promoting an existing interface plus a queue
  boundary, not untangling a God module.

Negative / cost:

- Module boundaries depend on lint rules plus review; the rules catch the
  imports that matter, not every possible coupling.
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
