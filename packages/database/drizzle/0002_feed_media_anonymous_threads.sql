CREATE TYPE "public"."feed_media_kind" AS ENUM('image', 'video', 'document');
ALTER TABLE "feed_posts" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;
ALTER TABLE "feed_post_comments" ADD COLUMN "parent_comment_id" uuid;
ALTER TABLE "feed_post_comments" ADD CONSTRAINT "feed_post_comments_parent_comment_id_feed_post_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."feed_post_comments"("id") ON DELETE cascade;
CREATE TABLE "feed_post_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "kind" "feed_media_kind" NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "original_name" varchar(255) NOT NULL,
  "size_bytes" integer NOT NULL,
  "data_base64" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "feed_post_media_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade
);
CREATE INDEX "feed_post_media_post_idx" ON "feed_post_media" USING btree ("post_id");
CREATE TABLE "feed_post_reposts" (
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "feed_post_reposts_post_id_user_id_pk" PRIMARY KEY("post_id","user_id"),
  CONSTRAINT "feed_post_reposts_post_id_feed_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."feed_posts"("id") ON DELETE cascade,
  CONSTRAINT "feed_post_reposts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
