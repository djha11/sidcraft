ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "media_kind" varchar(8);
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "media_url" text;
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "media_original_name" varchar(255);
ALTER TABLE "poll_options" ADD COLUMN IF NOT EXISTS "media_url" text;
ALTER TYPE "poll_audience_scope" ADD VALUE IF NOT EXISTS 'global';
ALTER TYPE "poll_audience_scope" ADD VALUE IF NOT EXISTS 'country';
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "target_country_code" varchar(2) DEFAULT 'IN';
