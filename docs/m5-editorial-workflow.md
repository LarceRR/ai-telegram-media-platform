# M5 Editorial Workflow

## PR slices

- PR25: source-backed image candidates and deterministic selection.
- PR26: channel-scoped moderation queue with reasoned, atomic actions.
- PR27: immutable post versions with claims/evidence provenance and score invalidation.
- PR28: deterministic quality gate routing for MODERATED and constrained AUTO modes.

## Safety rules

Every human moderation action requires a reason and creates an audit event. Human edits append a post version and invalidate active score rows. `AUTO` never bypasses WAIT, REGENERATE, or unverified-claim decisions. `MODERATED` routes a REVIEW decision to the queue.

## Failure and rollback

Missing access, stale moderation rows, invalid contracts, and unverified claims fail closed. M5 migrations are additive; roll back by reverting the latest migration and module commit in reverse order.
