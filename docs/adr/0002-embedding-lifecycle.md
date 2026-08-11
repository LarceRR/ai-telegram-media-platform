# ADR-0002: embedding lifecycle

## Decision

M3 uses a deterministic `hashed-bow-v1` provider behind an `EmbeddingProvider` port. Vectors are 1536-dimensional and searched with cosine distance in pgvector using an HNSW index.

## Why

M3 needs reproducible duplicate and update decisions without a network dependency, provider credentials or CI spend. The provider name and dimensions are persisted with each memory row, while `embedding_index_metadata` records the index contract.

## Consequences

The provider is suitable for deterministic candidate generation, not semantic truth. A model replacement is a migration event: update metadata, rebuild or re-index vectors, and compare recall fixtures before changing thresholds. Similarity never bypasses entity/topic checks.
