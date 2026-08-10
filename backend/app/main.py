from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, HttpUrl
import structlog

from .pipeline import Pipeline, SourceItem

log = structlog.get_logger()
app = FastAPI(title="AI Telegram Media Platform", version="0.1.0")
pipeline = Pipeline()

class IngestRequest(BaseModel):
    url: HttpUrl
    title: str = Field(min_length=1, max_length=500)
    body: str = Field(min_length=1)
    published_at: datetime | None = None
    image_url: HttpUrl | None = None

class IngestResponse(BaseModel):
    item_id: str
    duplicate: bool
    decision: str
    post_id: str | None = None

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/ready")
def ready() -> dict[str, str]:
    return {"status": "ready", "storage": "memory", "queue": "inline"}

@app.post("/api/v1/ingest", response_model=IngestResponse)
def ingest(request: IngestRequest) -> IngestResponse:
    item = SourceItem(
        url=str(request.url), title=request.title, body=request.body,
        published_at=request.published_at or datetime.now(timezone.utc),
        image_url=str(request.image_url) if request.image_url else None,
    )
    result = pipeline.process(item)
    log.info("ingestion_completed", item_id=item.id, decision=result.decision)
    return IngestResponse(item_id=item.id, duplicate=result.duplicate, decision=result.decision, post_id=result.post_id)

@app.get("/api/v1/moderation")
def moderation_queue() -> list[dict]:
    return [post.model_dump(mode="json") for post in pipeline.moderation_queue()]

@app.post("/api/v1/posts/{post_id}/publish")
def publish(post_id: str) -> dict:
    try:
        return pipeline.publish(post_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="post not found") from exc
