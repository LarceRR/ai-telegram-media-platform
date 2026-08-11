# M4: AI pipeline

M4 adds the AI boundary without allowing provider details to leak into domain or application code.

The milestone order is: contracts and audit persistence, provider adapter, research decision and evidence, structured writing, fact checking and scoring, then the full exit gate. Every machine-consumed result is Zod-validated. Invalid output is a typed failure, retried within bounds, and recorded as an `AIRun`; it is never silently accepted.

`AIProvider` owns HTTP, authentication, timeout, retry classification, token and cost parsing, and redaction. The first real adapter is OpenRouter. CI uses a fake provider and fake transport only. Real credentials are never required.

Every run records task type, provider, model, prompt/config versions, redacted input/output references, token usage, cost, latency, status, error category and correlation id. Large payloads belong in object storage, not unbounded database text.

M4 does not publish, schedule, moderate, or edit posts. Those are M5/M6 concerns.
