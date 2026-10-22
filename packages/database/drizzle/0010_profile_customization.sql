ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "website" varchar(500);
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_kind" varchar(10);
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_mime_type" varchar(100);
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_data_base64" text;
