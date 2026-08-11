-- M4 AI audit foundation. Large prompts and responses remain references, not unbounded text.
CREATE TYPE "AITaskType" AS ENUM ('DISCOVERY', 'STORY_CLASSIFICATION', 'RESEARCH_DECISION', 'RESEARCH', 'WRITING', 'FACT_CHECKING', 'SCORING', 'IMAGE_SELECTION', 'FINAL_JUDGE', 'OPTIMIZATION');
CREATE TYPE "AIRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'FALLBACK');

CREATE TABLE "ai_models" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "input_cost_usd_per_1k" DOUBLE PRECISION,
  "output_cost_usd_per_1k" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_models_provider_model_version_key" ON "ai_models"("provider", "model", "version");
CREATE INDEX "ai_models_enabled_priority_idx" ON "ai_models"("enabled", "priority");

CREATE TABLE "ai_prompts" (
  "id" UUID NOT NULL,
  "task_type" "AITaskType" NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_prompts_task_type_name_key" ON "ai_prompts"("task_type", "name");

CREATE TABLE "ai_prompt_versions" (
  "id" UUID NOT NULL,
  "prompt_id" UUID NOT NULL,
  "version" TEXT NOT NULL,
  "system_prompt_ref" TEXT NOT NULL,
  "user_prompt_template_ref" TEXT NOT NULL,
  "response_schema" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_prompt_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_prompt_versions_prompt_id_version_key" ON "ai_prompt_versions"("prompt_id", "version");
CREATE INDEX "ai_prompt_versions_prompt_id_active_idx" ON "ai_prompt_versions"("prompt_id", "active");
ALTER TABLE "ai_prompt_versions" ADD CONSTRAINT "ai_prompt_versions_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "ai_prompts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ai_configs" (
  "id" UUID NOT NULL,
  "task_type" "AITaskType" NOT NULL,
  "version" TEXT NOT NULL,
  "default_model" TEXT NOT NULL,
  "fallback_models" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "max_tokens" INTEGER NOT NULL DEFAULT 2000,
  "timeout_ms" INTEGER NOT NULL DEFAULT 60000,
  "max_attempts" INTEGER NOT NULL DEFAULT 2,
  "monthly_budget_usd" DOUBLE PRECISION,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_configs_task_type_version_key" ON "ai_configs"("task_type", "version");
CREATE INDEX "ai_configs_task_type_active_idx" ON "ai_configs"("task_type", "active");

CREATE TABLE "ai_runs" (
  "id" UUID NOT NULL,
  "task_type" "AITaskType" NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "config_version" TEXT NOT NULL,
  "input_ref" TEXT,
  "output_ref" TEXT,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "total_tokens" INTEGER,
  "cost_usd" DOUBLE PRECISION,
  "latency_ms" INTEGER,
  "status" "AIRunStatus" NOT NULL,
  "error_category" TEXT,
  "error_message" TEXT,
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_runs_task_type_created_at_idx" ON "ai_runs"("task_type", "created_at");
CREATE INDEX "ai_runs_status_created_at_idx" ON "ai_runs"("status", "created_at");
CREATE INDEX "ai_runs_correlation_id_idx" ON "ai_runs"("correlation_id");
