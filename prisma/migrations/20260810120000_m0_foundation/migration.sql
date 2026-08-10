-- M0 foundation migration: pgvector extension, audit trail, embedding probe.

CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('HUMAN', 'SYSTEM', 'AI');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vector_probe" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vector_probe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_created_at_idx" ON "audit_log"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_action_created_at_idx" ON "audit_log"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_correlation_id_idx" ON "audit_log"("correlation_id");

-- CreateIndex (pgvector): cosine distance, HNSW. Revisit after M3 benchmark.
CREATE INDEX "vector_probe_embedding_hnsw_idx" ON "vector_probe" USING hnsw ("embedding" vector_cosine_ops);
