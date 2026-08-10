# AI Telegram Media Platform

First vertical slice of a modular monolith for AI-assisted Telegram publishing.

## Scope

This slice provides a runnable FastAPI service with:

- one-channel configuration in memory;
- RSS ingestion with canonical URL and content-hash deduplication;
- typed pipeline: discovery, writing, claim extraction, fact check, scoring and quality gate;
- deterministic FakeProvider for tests and a port for future OpenRouter integration;
- moderation queue and idempotent publication records;
- structured JSON logs and health/readiness endpoints.

The implementation deliberately keeps Telegram delivery behind a port. No secrets or real external credentials are required to run tests.

## Run

```bash
docker compose up --build
curl http://localhost:8000/health
curl http://localhost:8000/docs
```

Local development:

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
pytest
uvicorn app.main:app --reload
```

## Next vertical slice

Persist the domain in PostgreSQL, add Redis/ARQ workers, and connect the Telegram adapter only after the deterministic pipeline and moderation flow are stable.
