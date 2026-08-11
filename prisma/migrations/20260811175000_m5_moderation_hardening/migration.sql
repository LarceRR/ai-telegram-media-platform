ALTER TABLE "moderation_queue" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS "moderation_queue_post_id_status_idx" ON "moderation_queue"("post_id", "status");
