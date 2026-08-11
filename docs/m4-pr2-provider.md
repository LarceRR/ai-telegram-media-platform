# M4 PR2: provider boundary

`AIProvider` is the only application-facing interface. The OpenRouter adapter owns HTTP, authentication headers, timeout handling, response parsing, usage accounting and provider error classification.

CI binds `AI_PROVIDER` to `FakeAIProvider`, so tests never need an API key or a network call. Production wiring can select OpenRouter only when `OPENROUTER_API_KEY` is configured.

Provider failures are typed: authentication is non-retryable, rate limits and upstream failures are retryable, and malformed JSON is an invalid-output failure. Error messages never include the credential.