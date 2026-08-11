# ADR-0006: Smart Memory v1

## Decision

Smart Memory uses a rule-first cascade: exact content hash, canonical URL, active pgvector neighbours, then entity/topic overlap. Decisions are `NEW`, `RELATED`, `UPDATE` or `DUPLICATE` and are persisted with method, confidence, config version and explanation.

## Why

Exact rules are cheap and auditable. Vectors handle near-duplicates that formatting or wording changes defeat, but similarity alone creates false positives. Requiring overlap keeps the system conservative, while retaining rejected candidates preserves editorial provenance.

## Consequences

Thresholds are configuration and must remain ordered: `duplicate >= update >= related`. Threshold changes are a new memory config version and should trigger a bounded re-evaluation, never a silent rewrite of history.
