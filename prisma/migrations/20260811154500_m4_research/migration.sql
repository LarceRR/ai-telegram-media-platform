-- M4 research runs and claim evidence staging.
CREATE TYPE "ResearchLevel" AS ENUM ('LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3');
CREATE TYPE "ResearchRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
CREATE TYPE "EvidenceStatus" AS ENUM ('SUPPORTS', 'CONTRADICTS', 'INCONCLUSIVE', 'UNVERIFIED');
CREATE TABLE "research_runs" (
  "id" UUID NOT NULL,
  "channel_id" UUID NOT NULL,
  "idea_id" UUID NOT NULL,
  "level" "ResearchLevel" NOT NULL,
  "config_version" TEXT NOT NULL,
  "status" "ResearchRunStatus" NOT NULL,
  "evidence_count" INTEGER NOT NULL DEFAULT 0,
  "error_category" TEXT,
  "error_message" TEXT,
  "correlation_id" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "research_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "research_runs_channel_id_created_at_idx" ON "research_runs"("channel_id", "created_at");
CREATE INDEX "research_runs_idea_id_created_at_idx" ON "research_runs"("idea_id", "created_at");
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "content_ideas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
