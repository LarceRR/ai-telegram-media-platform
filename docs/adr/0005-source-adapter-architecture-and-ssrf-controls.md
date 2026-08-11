# ADR-0005: Source adapter architecture and SSRF controls

- Status: Accepted
- Date: 2026-08-11
- Milestone: M2

## Context

Sources are untrusted network inputs. RSS and generic web pages need different parsing rules, while ingestion, persistence and queue orchestration must not change when a new source type is added. A naive fetcher also creates an SSRF path into private infrastructure.

## Decision

Adapters implement a transport-agnostic `SourceAdapter` port with `fetch()` and `health()` plus declared rate-limit metadata. A DI registry resolves adapters by the contract source type. Adapter fetches return normalized items, quarantined malformed items and an opaque cursor. Typed `SourceIntegrationError` categories drive retry policy: timeouts, rate limits and upstream failures retry; validation, contract and authorization failures do not.

All outbound requests go through `HardenedHttpClient`: HTTP(S) only, no URL credentials, DNS and IP-literal validation, block private/link-local/reserved ranges, revalidate every redirect hop, cap redirects, enforce timeout, content-type allowlist and declared/body size limits. HTML/XML is processed by a bounded linear scanner that drops executable/embedded blocks, rejects unsafe URLs and quarantines malformed records.

## Consequences

- New adapters are provider registrations, not pipeline branches.
- Cursors support conditional requests and feed watermarks without leaking transport state into the application layer.
- A broken source records a health snapshot and fails only its own job; other sources continue.
- Some malformed markup is preserved only as a quarantine reason, never silently promoted to content.
- The client intentionally blocks ambiguous or unusual address ranges, trading a few obscure public endpoints for SSRF safety.

## Rejected alternatives

- Blind `fetch()` with automatic redirects: unsafe against DNS rebinding and redirect-to-metadata attacks.
- A general-purpose DOM parser in the ingestion boundary: larger attack surface and uncontrolled work for hostile pages.
- Letting each adapter classify errors independently: inconsistent retries and invisible operational failures.
