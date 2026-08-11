CREATE TABLE "image_candidates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_item_id" UUID NOT NULL,
  "source_image_id" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "alt" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "mime_type" TEXT,
  "validation_status" TEXT NOT NULL DEFAULT 'VALID',
  "selection_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "selected_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "image_candidates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "image_candidates_source_image_id_key" ON "image_candidates"("source_image_id");
CREATE INDEX "image_candidates_source_item_id_validation_status_idx" ON "image_candidates"("source_item_id", "validation_status");
ALTER TABLE "image_candidates" ADD CONSTRAINT "image_candidates_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "source_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "image_candidates" ADD CONSTRAINT "image_candidates_source_image_id_fkey" FOREIGN KEY ("source_image_id") REFERENCES "source_images"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
