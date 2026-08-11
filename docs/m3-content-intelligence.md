# M3: content intelligence

## Scope

M3 turns normalized source material into durable editorial candidates without calling an AI provider. It implements the deterministic part of `Find -> Understand -> Verify`: ideas, stories, memory, vector search and explainable duplicate/update classification. OpenRouter and LLM judgement remain M4 work.

## Pipeline

`SourceItem -> DiscoveryService -> ContentIdea -> MemoryService -> StoryGraphService`

The ingestion worker hands off a successful source run to the `content-intelligence` queue. The handoff carries the channel and source identity and uses a deterministic batch key. Replaying a job therefore reuses the BullMQ job id instead of producing a second discovery pass.

Discovery is channel-scoped and idempotent on `(channelId, sourceItemId)`. It persists normalized title/text, content hash, canonical URL, entities, topics, rank, decision, confidence and explanation. A duplicate is retained as a rejected idea with a mandatory reason. It is never silently dropped.

## Memory cascade

1. Exact normalized content hash, method `RULE`.
2. Canonical URL, method `RULE`.
3. Nearest active memory in PostgreSQL/pgvector, method `VECTOR`.
4. Entity/topic overlap is a required guard for `DUPLICATE` and `UPDATE`.

Similarity is a candidate generator, not proof. A high vector score with disagreeing entities becomes `RELATED`, not `DUPLICATE`. Every result carries a config version, confidence, match metadata and a human-readable explanation. Memory is indexed only after classification, so a candidate cannot match itself.

The M3 embedding is `hashed-bow-v1`, 1536 dimensions, cosine distance. It is deterministic and offline so CI never calls a provider. Replacing it requires re-indexing and updating `embedding_index_metadata`.

## Story graph

A Story is a durable topic cluster. One story can contain many source items and ideas, which allows a later item to be an `UPDATE` or `CONTINUATION` rather than a duplicate. Relations are typed and carry method, confidence and evidence. The graph currently uses deterministic entity/topic Jaccard overlap; richer semantic judgement belongs behind the M4 AI boundary.

## REST surface

- `GET /api/v1/ideas?channelId=...`
- `POST /api/v1/ideas/:id/reprocess`
- `POST /api/v1/ideas/:id/archive`
- `GET /api/v1/stories?channelId=...`
- `GET /api/v1/stories/:id/timeline`
- `GET /api/v1/stories/:id/relations`
- `GET /api/v1/memory?channelId=...`
- `GET /api/v1/memory/search?channelId=...&q=...`
- `POST /api/v1/memory/:id/re-evaluate`

Every route requires a channel member actor and never accepts a channel id from an unrelated object without checking membership.

## Exit criteria

The integration exit gate proves one normalized source item becomes an idea and a story, a semantically equivalent second item is retained but rejected as `DUPLICATE`, and replaying discovery does not create another idea, story or story-item link. Unit and integration CI must remain green before M3 is merged into the next milestone.
