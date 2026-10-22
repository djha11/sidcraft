CREATE TYPE "public"."publication_kind" AS ENUM('news', 'reel');
CREATE TYPE "public"."publication_category" AS ENUM('politics', 'sports', 'entertainment', 'business', 'tech', 'india', 'world');
CREATE TABLE "publications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "publication_kind" NOT NULL,
  "category" "publication_category" NOT NULL,
  "headline" varchar(180) NOT NULL,
  "summary" varchar(1200) NOT NULL,
  "media_url" text NOT NULL,
  "source_name" varchar(120) NOT NULL,
  "source_url" text NOT NULL,
  "evidence_note" varchar(500) NOT NULL,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "publications_kind_published_idx" ON "publications" USING btree ("kind","published_at");
