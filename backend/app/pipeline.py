from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from hashlib import sha256
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

class SourceItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    url: str
    title: str
    body: str
    published_at: datetime
    image_url: str | None = None

class Claim(BaseModel):
    text: str
    supported: bool = False

class Post(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(default_factory=lambda: str(uuid4()))
    source_item_id: str
    text: str
    claims: list[Claim]
    score: float
    gate: str
    status: str = "READY_FOR_REVIEW"
    provenance: dict[str, str]

@dataclass
class Result:
    decision: str
    duplicate: bool
    post_id: str | None = None

@dataclass
class Pipeline:
    seen_hashes: set[str] = field(default_factory=set)
    posts: dict[str, Post] = field(default_factory=dict)
    published: set[str] = field(default_factory=set)

    def process(self, item: SourceItem) -> Result:
        fingerprint = self._fingerprint(item)
        if fingerprint in self.seen_hashes:
            return Result("DUPLICATE", True)
        self.seen_hashes.add(fingerprint)

        claims = self._claims(item.body)
        text = f"{item.title}\n\n{item.body.strip()}"
        score = min(10.0, 5.0 + min(len(item.body) / 500, 3.0) + (1.0 if claims else 0.0))
        supported = all(claim.supported for claim in claims)
        gate = "REVIEW" if claims and not supported else ("PUBLISH" if score >= 7 else "REVIEW")
        post = Post(
            source_item_id=item.id, text=text, claims=claims, score=round(score, 2), gate=gate,
            provenance={"source_url": item.url, "provider": "fake", "pipeline_version": "0.1.0"},
        )
        self.posts[post.id] = post
        return Result(gate, False, post.id)

    def moderation_queue(self) -> list[Post]:
        return [post for post in self.posts.values() if post.status == "READY_FOR_REVIEW"]

    def publish(self, post_id: str) -> dict[str, str]:
        post = self.posts[post_id]
        if post_id not in self.published:
            self.published.add(post_id)
            post.status = "PUBLISHED"
        return {"post_id": post_id, "status": post.status, "idempotency_key": self._publication_key(post)}

    @staticmethod
    def _fingerprint(item: SourceItem) -> str:
        normalized = " ".join(f"{item.url} {item.title} {item.body}".lower().split())
        return sha256(normalized.encode()).hexdigest()

    @staticmethod
    def _claims(body: str) -> list[Claim]:
        sentences = [part.strip() for part in body.replace("!", ".").split(".") if part.strip()]
        return [Claim(text=sentence) for sentence in sentences if any(char.isdigit() for char in sentence)][:5]

    @staticmethod
    def _publication_key(post: Post) -> str:
        return f"channel:default:post:{post.id}:v1"
