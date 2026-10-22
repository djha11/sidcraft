ALTER TABLE "news_candidates" ADD COLUMN "story_id" uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "news_candidates" ADD COLUMN "draft_method" varchar(32) NOT NULL DEFAULT 'source_excerpt';
CREATE INDEX "news_candidates_story_idx" ON "news_candidates" ("story_id", "status");
