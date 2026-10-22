CREATE TYPE "post_status" AS ENUM ('active', 'hidden', 'removed');
CREATE TYPE "feed_report_reason" AS ENUM ('spam', 'harassment', 'hate', 'misinformation', 'other');

CREATE TABLE "feed_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" varchar(1000) NOT NULL,
  "status" "post_status" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(trim("body")) BETWEEN 1 AND 1000)
);
CREATE INDEX "feed_posts_created_idx" ON "feed_posts" ("created_at");
CREATE INDEX "feed_posts_author_idx" ON "feed_posts" ("author_id");

CREATE TABLE "feed_post_likes" (
  "post_id" uuid NOT NULL REFERENCES "feed_posts"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("post_id", "user_id")
);

CREATE TABLE "feed_post_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" uuid NOT NULL REFERENCES "feed_posts"("id") ON DELETE CASCADE,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" varchar(500) NOT NULL,
  "status" "post_status" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(trim("body")) BETWEEN 1 AND 500)
);
CREATE INDEX "feed_post_comments_post_idx" ON "feed_post_comments" ("post_id", "created_at");

CREATE TABLE "feed_post_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" uuid NOT NULL REFERENCES "feed_posts"("id") ON DELETE CASCADE,
  "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" "feed_report_reason" NOT NULL,
  "note" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "feed_post_reports_reporter_unique" ON "feed_post_reports" ("post_id", "reporter_id");

CREATE TABLE "user_blocks" (
  "blocker_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("blocker_id", "blocked_id"),
  CHECK ("blocker_id" <> "blocked_id")
);
