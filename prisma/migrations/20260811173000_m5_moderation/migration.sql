CREATE TABLE "moderation_queue" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "post_id" UUID NOT NULL,
  "channel_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "acted_by" UUID,
  "acted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_queue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "moderation_queue_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','REGENERATION_REQUESTED'))
);
CREATE UNIQUE INDEX "moderation_queue_post_id_key" ON "moderation_queue"("post_id");
CREATE INDEX "moderation_queue_channel_id_status_created_at_idx" ON "moderation_queue"("channel_id", "status", "created_at");
