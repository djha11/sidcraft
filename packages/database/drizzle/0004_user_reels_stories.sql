ALTER TABLE "feed_post_media" ADD COLUMN "duration_seconds" integer;
CREATE TABLE "stories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" "feed_media_kind" NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "original_name" varchar(255) NOT NULL,
  "size_bytes" integer NOT NULL,
  "data_base64" text NOT NULL,
  "duration_seconds" integer,
  "caption" varchar(280) DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE INDEX "stories_author_expires_idx" ON "stories" USING btree ("author_id", "expires_at");
