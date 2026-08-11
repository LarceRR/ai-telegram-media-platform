# M4: AI pipeline

M4 establishes the AI boundary and validates the pipeline inputs and outputs without allowing provider details into domain code.

## Pipeline contract

`Story -> research decision -> evidence -> writing draft -> claim verification -> five independent scores`

Research is deterministic policy: levels 0 through 3 depend on risk, contradictions, source coverage and claim density. High-risk contradictions require level 3 and independent evidence.

Writing output is untrusted. Every draft has story provenance, prompt version and claim-level evidence status. Invalid structured output is rejected before it enters content state.

Scores are independent and bounded from 0 to 10. Exactly five dimensions are required: Interest, Quality, Evidence, Originality and Virality Potential. M5 owns the final quality gate.

## Provider rules

Application code depends on `AIProvider`. OpenRouter owns HTTP, auth, timeout handling, JSON parsing, usage and cost accounting, while CI binds the fake provider and never needs credentials. Provider failures are typed and retryable only when safe.

Every provider result carries model, prompt version, latency, token usage and cost. Secrets are never included in errors or logs. Publishing, moderation and scheduling are explicitly out of scope for M4.
