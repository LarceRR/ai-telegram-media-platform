CREATE TYPE "ChannelMode" AS ENUM ('MODERATED', 'AUTO');
CREATE TYPE "ChannelMemberRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');
CREATE TYPE "CredentialProvider" AS ENUM ('TELEGRAM');

CREATE TABLE "app_user" (
  "id" UUID NOT NULL,
  "external_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "app_user_external_id_key" ON "app_user"("external_id");

CREATE TABLE "channel" (
  "id" UUID NOT NULL,
  "telegram_chat_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "username" TEXT,
  "language" TEXT NOT NULL DEFAULT 'en',
  "mode" "ChannelMode" NOT NULL DEFAULT 'MODERATED',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_telegram_chat_id_key" ON "channel"("telegram_chat_id");
CREATE INDEX "channel_active_created_at_idx" ON "channel"("active", "created_at");

CREATE TABLE "channel_member" (
  "id" UUID NOT NULL,
  "channel_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "ChannelMemberRole" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_member_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_member_channel_id_user_id_key" ON "channel_member"("channel_id", "user_id");
CREATE INDEX "channel_member_user_id_role_idx" ON "channel_member"("user_id", "role");
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "channel_member" ADD CONSTRAINT "channel_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "channel_settings" (
  "id" UUID NOT NULL,
  "channel_id" UUID NOT NULL,
  "min_interest" INTEGER NOT NULL DEFAULT 6,
  "min_quality" INTEGER NOT NULL DEFAULT 6,
  "min_evidence" INTEGER NOT NULL DEFAULT 7,
  "min_originality" INTEGER NOT NULL DEFAULT 5,
  "research_max_level" INTEGER NOT NULL DEFAULT 2,
  "forbidden_topics" JSONB NOT NULL DEFAULT '[]',
  "legal_restrictions" JSONB NOT NULL DEFAULT '[]',
  "blacklist" JSONB NOT NULL DEFAULT '[]',
  "hook_style" TEXT NOT NULL DEFAULT 'restrained',
  "max_length" INTEGER NOT NULL DEFAULT 4000,
  "emoji_policy" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_settings_channel_id_key" ON "channel_settings"("channel_id");
ALTER TABLE "channel_settings" ADD CONSTRAINT "channel_settings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "credential_reference" (
  "id" UUID NOT NULL,
  "channel_id" UUID NOT NULL,
  "provider" "CredentialProvider" NOT NULL,
  "reference" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credential_reference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "credential_reference_channel_id_provider_key" ON "credential_reference"("channel_id", "provider");
ALTER TABLE "credential_reference" ADD CONSTRAINT "credential_reference_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
