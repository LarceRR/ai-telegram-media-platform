CREATE TABLE "post_scores" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "post_id" UUID NOT NULL, "interest" DOUBLE PRECISION NOT NULL, "quality" DOUBLE PRECISION NOT NULL, "evidence" DOUBLE PRECISION NOT NULL, "originality" DOUBLE PRECISION NOT NULL, "virality" DOUBLE PRECISION NOT NULL, "invalidated_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_scores_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "post_scores_post_id_invalidated_at_idx" ON "post_scores"("post_id", "invalidated_at");
ALTER TABLE "post_scores" ADD CONSTRAINT "post_scores_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
