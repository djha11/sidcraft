CREATE TABLE IF NOT EXISTS "news_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(120) NOT NULL,
  "feed_url" text NOT NULL UNIQUE,
  "website_url" text,
  "category" publication_category NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "polling_minutes" integer NOT NULL DEFAULT 15,
  "last_fetched_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "news_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_id" uuid NOT NULL REFERENCES "news_sources"("id") ON DELETE CASCADE,
  "source_url" text NOT NULL UNIQUE,
  "original_headline" varchar(500) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "source_published_at" timestamptz,
  "status" varchar(24) NOT NULL DEFAULT 'needs_review',
  "final_headline" varchar(180),
  "final_summary" varchar(1200),
  "media_url" text,
  "media_attribution" text,
  "publication_id" uuid REFERENCES "publications"("id"),
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "news_candidates_status_created_idx" ON "news_candidates" ("status", "created_at");
