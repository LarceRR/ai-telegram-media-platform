CREATE TABLE "posts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "channel_id" UUID NOT NULL, "story_id" UUID, "status" TEXT NOT NULL DEFAULT 'DRAFT', "current_version" INTEGER NOT NULL DEFAULT 1, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "post_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "post_id" UUID NOT NULL, "version_number" INTEGER NOT NULL, "body" TEXT NOT NULL, "source" TEXT NOT NULL DEFAULT 'AI', "created_by" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_versions_pkey" PRIMARY KEY ("id"), CONSTRAINT "post_versions_post_version_key" UNIQUE ("post_id", "version_number")
);
CREATE TABLE "claims" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "post_version_id" UUID NOT NULL, "text" TEXT NOT NULL, "verification_status" TEXT NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "claims_pkey" PRIMARY KEY ("id"));
CREATE TABLE "evidence" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "claim_id" UUID NOT NULL, "source_item_id" UUID, "url" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'SUPPORTING', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "evidence_pkey" PRIMARY KEY ("id"));
CREATE INDEX "posts_channel_id_status_updated_at_idx" ON "posts"("channel_id", "status", "updated_at");
ALTER TABLE "post_versions" ADD CONSTRAINT "post_versions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "claims" ADD CONSTRAINT "claims_post_version_id_fkey" FOREIGN KEY ("post_version_id") REFERENCES "post_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
