# M2: sources and ingestion

M2 adds RSS and generic web source adapters, channel-scoped source bindings, normalized source item persistence, health snapshots, deterministic content hashes, and an idempotent BullMQ ingestion job.

## API

- `GET /api/v1/channels/:channelId/sources`
- `POST /api/v1/channels/:channelId/sources`
- `PATCH /api/v1/channels/:channelId/sources/:sourceId`
- `POST /api/v1/channels/:channelId/sources/:sourceId/ingest`

The existing actor header contract is used: `x-actor-id` or `x-user-id`. Source credentials are not accepted by the adapter. URLs are limited to HTTP(S), reject credentials, block private/link-local DNS results, revalidate redirects, enforce timeouts and cap response size at 5 MB.

Repeated ingestion upserts by `(sourceId, externalItemId)` and also enforces `(sourceId, contentHash)`. Adapter failures create a `SourceHealthSnapshot` and are retried by BullMQ according to the ingestion queue policy.
