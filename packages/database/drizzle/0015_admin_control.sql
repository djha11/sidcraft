ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "verification_type" varchar(24);

CREATE TABLE IF NOT EXISTS "verification_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "requested_type" varchar(24) NOT NULL,
  "evidence_url" text,
  "note" varchar(600),
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "review_note" varchar(600),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "verification_requests_user_idx" ON "verification_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "verification_requests_status_idx" ON "verification_requests" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "moderation_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "target_type" varchar(24) NOT NULL,
  "target_id" uuid NOT NULL,
  "action" varchar(24) NOT NULL,
  "reason" varchar(600) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ad_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(120) NOT NULL,
  "advertiser" varchar(120) NOT NULL,
  "headline" varchar(180) NOT NULL,
  "destination_url" text NOT NULL,
  "media_url" text,
  "status" varchar(16) DEFAULT 'draft' NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
