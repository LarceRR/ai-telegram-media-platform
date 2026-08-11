CREATE TYPE "SourceType" AS ENUM ('RSS', 'WEB');
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');
CREATE TYPE "SourceHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'FAILED');
CREATE TABLE "sources" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL, "type" "SourceType" NOT NULL, "url" TEXT NOT NULL,
  "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE', "config" JSONB NOT NULL DEFAULT '{}',
  "last_cursor" TEXT, "last_ingested_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sources_type_url_key" ON "sources"("type", "url");
CREATE INDEX "sources_status_updated_at_idx" ON "sources"("status", "updated_at");
CREATE TABLE "channel_sources" (
  "id" UUID NOT NULL, "channel_id" UUID NOT NULL, "source_id" UUID NOT NULL, "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "channel_sources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_sources_channel_id_source_id_key" ON "channel_sources"("channel_id", "source_id");
CREATE INDEX "channel_sources_channel_id_enabled_priority_idx" ON "channel_sources"("channel_id", "enabled", "priority");
CREATE TABLE "source_items" (
  "id" UUID NOT NULL, "source_id" UUID NOT NULL, "external_item_id" TEXT NOT NULL, "canonical_url" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL, "title" TEXT NOT NULL, "author" TEXT, "published_at" TIMESTAMP(3), "text" TEXT NOT NULL,
  "normalized_text" TEXT NOT NULL, "metadata" JSONB NOT NULL DEFAULT '{}', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "source_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "source_items_source_id_external_item_id_key" ON "source_items"("source_id", "external_item_id");
CREATE UNIQUE INDEX "source_items_source_id_content_hash_key" ON "source_items"("source_id", "content_hash");
CREATE INDEX "source_items_source_id_published_at_idx" ON "source_items"("source_id", "published_at");
CREATE INDEX "source_items_content_hash_idx" ON "source_items"("content_hash");
CREATE TABLE "source_images" (
  "id" UUID NOT NULL, "source_item_id" UUID NOT NULL, "url" TEXT NOT NULL, "alt" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "source_images_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "source_images_source_item_id_url_key" ON "source_images"("source_item_id", "url");
CREATE TABLE "source_health_snapshots" (
  "id" UUID NOT NULL, "source_id" UUID NOT NULL, "status" "SourceHealthStatus" NOT NULL, "latency_ms" INTEGER,
  "http_status" INTEGER, "error_category" TEXT, "error_message" TEXT, "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_health_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "source_health_snapshots_source_id_checked_at_idx" ON "source_health_snapshots"("source_id", "checked_at");
ALTER TABLE "channel_sources" ADD CONSTRAINT "channel_sources_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_sources" ADD CONSTRAINT "channel_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "source_images" ADD CONSTRAINT "source_images_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "source_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_health_snapshots" ADD CONSTRAINT "source_health_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
