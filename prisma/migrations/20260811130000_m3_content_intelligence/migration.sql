-- M3 content intelligence: ideas, story graph, smart memory and vector search.

-- CreateEnum
CREATE TYPE "ContentIdeaStatus" AS ENUM ('DISCOVERED', 'ANALYZING', 'CANDIDATE', 'WAITING_FOR_EVIDENCE', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "StoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "StoryRelationType" AS ENUM ('RELATED', 'UPDATE', 'CONTINUATION', 'DUPLICATE');
CREATE TYPE "MatchMethod" AS ENUM ('RULE', 'VECTOR', 'LLM', 'HUMAN');
CREATE TYPE "MemoryDecision" AS ENUM ('NEW', 'RELATED', 'UPDATE', 'DUPLICATE');
CREATE TYPE "MemoryItemKind" AS ENUM ('SOURCE_ITEM', 'IDEA', 'STORY', 'PUBLICATION');
CREATE TYPE "MemoryItemState" AS ENUM ('ACTIVE', 'PENDING', 'ARCHIVED');

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "status" "StoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "entities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_ideas" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "source_item_id" UUID NOT NULL,
    "story_id" UUID,
    "status" "ContentIdeaStatus" NOT NULL DEFAULT 'DISCOVERED',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "normalized_text" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "entities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rank" INTEGER NOT NULL DEFAULT 0,
    "decision" "MemoryDecision" NOT NULL DEFAULT 'NEW',
    "decision_method" "MatchMethod" NOT NULL DEFAULT 'RULE',
    "decision_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "decision_explanation" TEXT,
    "rejection_reason" TEXT,
    "classified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_source_items" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "source_item_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_source_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_relations" (
    "id" UUID NOT NULL,
    "from_story_id" UUID NOT NULL,
    "to_story_id" UUID NOT NULL,
    "type" "StoryRelationType" NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_items" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "kind" "MemoryItemKind" NOT NULL,
    "state" "MemoryItemState" NOT NULL DEFAULT 'ACTIVE',
    "ref_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "normalized_text" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "canonical_url" TEXT,
    "entities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embedding_model" TEXT NOT NULL,
    "embedding_dim" INTEGER NOT NULL,
    "embedding" vector(1536),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_decisions" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "idea_id" UUID,
    "decision" "MemoryDecision" NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "matched_memory_item_id" UUID,
    "distance" DOUBLE PRECISION,
    "entity_overlap" DOUBLE PRECISION,
    "config_version" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embedding_index_metadata" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "distance" TEXT NOT NULL,
    "index_type" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embedding_index_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stories_channel_id_status_last_seen_at_idx" ON "stories"("channel_id", "status", "last_seen_at");
CREATE UNIQUE INDEX "content_ideas_channel_id_source_item_id_key" ON "content_ideas"("channel_id", "source_item_id");
CREATE INDEX "content_ideas_channel_id_status_created_at_idx" ON "content_ideas"("channel_id", "status", "created_at");
CREATE INDEX "content_ideas_channel_id_content_hash_idx" ON "content_ideas"("channel_id", "content_hash");
CREATE INDEX "content_ideas_story_id_idx" ON "content_ideas"("story_id");
CREATE UNIQUE INDEX "story_source_items_story_id_source_item_id_key" ON "story_source_items"("story_id", "source_item_id");
CREATE INDEX "story_source_items_source_item_id_idx" ON "story_source_items"("source_item_id");
CREATE UNIQUE INDEX "story_relations_from_story_id_to_story_id_type_key" ON "story_relations"("from_story_id", "to_story_id", "type");
CREATE INDEX "story_relations_to_story_id_idx" ON "story_relations"("to_story_id");
CREATE UNIQUE INDEX "memory_items_channel_id_kind_ref_id_key" ON "memory_items"("channel_id", "kind", "ref_id");
CREATE INDEX "memory_items_channel_id_state_kind_idx" ON "memory_items"("channel_id", "state", "kind");
CREATE INDEX "memory_items_channel_id_content_hash_idx" ON "memory_items"("channel_id", "content_hash");
CREATE INDEX "memory_items_channel_id_canonical_url_idx" ON "memory_items"("channel_id", "canonical_url");
CREATE INDEX "memory_decisions_channel_id_created_at_idx" ON "memory_decisions"("channel_id", "created_at");
CREATE INDEX "memory_decisions_idea_id_created_at_idx" ON "memory_decisions"("idea_id", "created_at");
CREATE INDEX "memory_decisions_decision_created_at_idx" ON "memory_decisions"("decision", "created_at");
CREATE UNIQUE INDEX "embedding_index_metadata_name_key" ON "embedding_index_metadata"("name");

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- RESTRICT: a source item is provenance. Deleting it would orphan the idea's origin.
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "source_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "story_source_items" ADD CONSTRAINT "story_source_items_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_source_items" ADD CONSTRAINT "story_source_items_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "source_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "story_relations" ADD CONSTRAINT "story_relations_from_story_id_fkey" FOREIGN KEY ("from_story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_relations" ADD CONSTRAINT "story_relations_to_story_id_fkey" FOREIGN KEY ("to_story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memory_decisions" ADD CONSTRAINT "memory_decisions_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL, not CASCADE: the decision log outlives the idea it explains.
ALTER TABLE "memory_decisions" ADD CONSTRAINT "memory_decisions_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "content_ideas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "memory_decisions" ADD CONSTRAINT "memory_decisions_matched_memory_item_id_fkey" FOREIGN KEY ("matched_memory_item_id") REFERENCES "memory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A rejected idea without a reason is unexplainable, so make it unstorable.
-- Prisma cannot express CHECK constraints; this one is SQL-owned on purpose.
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_rejection_reason_check"
  CHECK ("status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

-- Vector search. HNSW with cosine distance, matching EMBEDDING_DISTANCE in
-- @atmp/contracts. Revisit against IVFFlat once corpus size justifies a rebuild.
CREATE INDEX "memory_items_embedding_hnsw_idx" ON "memory_items" USING hnsw ("embedding" vector_cosine_ops);

-- Partial index: duplicate checks only ever scan live memory of one channel.
-- SQL-owned, Prisma has no partial index syntax.
CREATE INDEX "memory_items_active_channel_idx" ON "memory_items"("channel_id", "kind") WHERE "state" = 'ACTIVE';

-- Declare the space the index was built for, so a model change is a visible diff.
INSERT INTO "embedding_index_metadata" ("id", "name", "model", "dimensions", "distance", "index_type", "notes", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  'memory_items_embedding_hnsw_idx',
  'hashed-bow-v1',
  1536,
  'cosine',
  'hnsw',
  'M3 deterministic embedding. Replacing the model requires a re-index migration.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
