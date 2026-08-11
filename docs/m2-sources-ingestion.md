# M2: sources and ingestion

M2 is complete on `feat/m2-completion`.

## Delivered

- Adapter contract and DI registry with fetch, health, rate-limit metadata, typed errors and cursor contracts.
- RSS 2.0 and Atom normalization: canonical URL, title, text, date, author and source media extraction.
- Hardened generic web adapter with protocol/DNS/IP/redirect/content-type/timeout/size controls, bounded markup parsing and malformed-item quarantine.
- Channel-scoped persistence for sources, bindings, normalized items, images, hashes and health snapshots.
- Idempotent ingestion jobs with rate-window keys, cursor persistence, content-hash deduplication and per-source failure isolation.
- REST source management endpoints and an admin UI for add/edit/enable/disable, categories, priority, health and manual ingestion.

## API

- `GET /api/v1/channels/:channelId/sources`
- `POST /api/v1/channels/:channelId/sources`
- `PATCH /api/v1/channels/:channelId/sources/:sourceId`
- `POST /api/v1/channels/:channelId/sources/ingest`
- `POST /api/v1/channels/:channelId/sources/:sourceId/ingest`
- `GET /api/v1/channels/:channelId/sources/:sourceId/health`

## Exit gate

One channel can ingest multiple RSS/web sources into normalized `SourceItem` and `SourceImage` rows. Repeated fetches do not duplicate rows, malformed records are quarantined, and one broken source produces its own typed health failure without stopping other sources. CI covers build, lint, typecheck, unit, integration and security checks.
