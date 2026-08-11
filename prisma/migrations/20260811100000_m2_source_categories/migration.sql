-- Operator-facing grouping for the source list. Empty by default so existing
-- rows stay valid without a backfill.
ALTER TABLE "sources" ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
