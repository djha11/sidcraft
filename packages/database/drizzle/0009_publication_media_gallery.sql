ALTER TABLE "publications" ADD COLUMN "media" jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE "publications" SET "media" = jsonb_build_array(jsonb_build_object('url', "media_url", 'kind', CASE WHEN "media_url" ~* '\\.(mp4|mov|webm)(\\?|$)' THEN 'video' ELSE 'image' END));
