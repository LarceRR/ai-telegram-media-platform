# ADR-0004: AI provider abstraction

## Decision

Use an `AIProvider` port with OpenRouter as the first adapter and a deterministic fake provider for CI. The adapter owns HTTP, authentication, timeout, retry classification, response parsing, usage and cost accounting.

## Consequences

Provider outages and rate limits are isolated from domain logic. A real credential is never needed for tests. Adding another provider changes infrastructure wiring, not task contracts or application use cases.
