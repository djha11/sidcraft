ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_scale" integer NOT NULL DEFAULT 1000;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_offset_x" integer NOT NULL DEFAULT 0;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "avatar_offset_y" integer NOT NULL DEFAULT 0;
