from datetime import datetime, timezone

from app.pipeline import Pipeline, SourceItem


def item(body: str = "A new event happened in 2026.") -> SourceItem:
    return SourceItem(url="https://example.com/story", title="Story", body=body, published_at=datetime.now(timezone.utc))


def test_dedup_is_deterministic():
    pipeline = Pipeline()
    first = pipeline.process(item())
    second = pipeline.process(item())
    assert first.duplicate is False
    assert second.duplicate is True


def test_claims_force_review_until_evidence_exists():
    pipeline = Pipeline()
    result = pipeline.process(item())
    assert result.decision == "REVIEW"
    assert pipeline.moderation_queue()[0].claims[0].supported is False


def test_publish_is_idempotent():
    pipeline = Pipeline()
    result = pipeline.process(item("A quiet editorial note without numeric claims."))
    first = pipeline.publish(result.post_id)
    second = pipeline.publish(result.post_id)
    assert first == second
    assert pipeline.posts[result.post_id].status == "PUBLISHED"
