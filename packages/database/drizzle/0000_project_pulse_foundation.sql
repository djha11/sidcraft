CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "user_status" AS ENUM ('active', 'restricted', 'suspended', 'deleted');
CREATE TYPE "region_kind" AS ENUM ('state', 'union_territory');
CREATE TYPE "constituency_reservation" AS ENUM ('GENERAL', 'SC', 'ST');
CREATE TYPE "location_source" AS ENUM ('device', 'manual');
CREATE TYPE "location_precision" AS ENUM ('state', 'constituency');
CREATE TYPE "poll_status" AS ENUM ('draft', 'active', 'closed', 'cancelled');
CREATE TYPE "poll_response_type" AS ENUM ('choice', 'open_text');
CREATE TYPE "poll_comment_mode" AS ENUM ('disabled', 'optional', 'required');
CREATE TYPE "poll_audience_scope" AS ENUM ('india', 'state', 'lok_sabha');
CREATE TYPE "analytics_role" AS ENUM ('poll_admin', 'analyst', 'business_viewer');

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "email" varchar(254) NOT NULL, "password_hash" text NOT NULL,
  "status" user_status NOT NULL DEFAULT 'active', "email_verified" boolean NOT NULL DEFAULT false,
  "accepted_terms_at" timestamptz NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email");
CREATE TABLE "profiles" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE, "display_name" varchar(60) NOT NULL,
  "handle" varchar(32) NOT NULL, "bio" varchar(280), "country_code" varchar(2), "language_code" varchar(10) NOT NULL DEFAULT 'en',
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "profiles_handle_unique" ON "profiles" ("handle");
CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "refresh_token_hash" text NOT NULL, "token_family_id" uuid NOT NULL, "replaced_by_session_id" uuid,
  "expires_at" timestamptz NOT NULL, "revoked_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "sessions_user_idx" ON "sessions" ("user_id");
CREATE TABLE "follows" (
  "follower_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "followed_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("follower_id", "followed_id"), CHECK ("follower_id" <> "followed_id")
);

CREATE TABLE "india_regions" (
  "code" varchar(2) PRIMARY KEY, "name" varchar(80) NOT NULL, "kind" region_kind NOT NULL,
  "lok_sabha_seats" integer NOT NULL CHECK ("lok_sabha_seats" >= 0), "rajya_sabha_seats" integer NOT NULL CHECK ("rajya_sabha_seats" >= 0),
  "source_url" text NOT NULL, "source_checked_at" timestamptz NOT NULL
);
CREATE TABLE "lok_sabha_constituencies" (
  "code" varchar(16) PRIMARY KEY, "state_code" varchar(2) NOT NULL REFERENCES "india_regions"("code") ON DELETE RESTRICT,
  "number" integer NOT NULL CHECK ("number" > 0), "name" varchar(120) NOT NULL, "reservation" constituency_reservation NOT NULL,
  "source_url" text NOT NULL, "valid_from" timestamptz NOT NULL
);
CREATE UNIQUE INDEX "lok_sabha_state_number_unique" ON "lok_sabha_constituencies" ("state_code", "number");
CREATE INDEX "lok_sabha_state_idx" ON "lok_sabha_constituencies" ("state_code");
CREATE TABLE "user_location_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "state_code" varchar(2) NOT NULL REFERENCES "india_regions"("code") ON DELETE RESTRICT,
  "lok_sabha_constituency_code" varchar(16) REFERENCES "lok_sabha_constituencies"("code") ON DELETE SET NULL,
  "source" location_source NOT NULL, "precision" location_precision NOT NULL, "consented_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CHECK (("precision" = 'state' AND "lok_sabha_constituency_code" IS NULL) OR ("precision" = 'constituency' AND "lok_sabha_constituency_code" IS NOT NULL))
);

CREATE TABLE "polls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "question" varchar(280) NOT NULL, "topic" varchar(80) NOT NULL,
  "status" poll_status NOT NULL DEFAULT 'draft', "response_type" poll_response_type NOT NULL DEFAULT 'choice',
  "comment_mode" poll_comment_mode NOT NULL DEFAULT 'disabled', "audience_scope" poll_audience_scope NOT NULL DEFAULT 'india',
  "target_state_code" varchar(2) REFERENCES "india_regions"("code") ON DELETE RESTRICT,
  "target_lok_sabha_constituency_code" varchar(16) REFERENCES "lok_sabha_constituencies"("code") ON DELETE RESTRICT,
  "opens_at" timestamptz NOT NULL, "closes_at" timestamptz NOT NULL, "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CHECK ("closes_at" > "opens_at"),
  CHECK (("audience_scope" = 'india' AND "target_state_code" IS NULL AND "target_lok_sabha_constituency_code" IS NULL)
    OR ("audience_scope" = 'state' AND "target_state_code" IS NOT NULL AND "target_lok_sabha_constituency_code" IS NULL)
    OR ("audience_scope" = 'lok_sabha' AND "target_state_code" IS NOT NULL AND "target_lok_sabha_constituency_code" IS NOT NULL))
);
CREATE TABLE "poll_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "poll_id" uuid NOT NULL REFERENCES "polls"("id") ON DELETE CASCADE,
  "label" varchar(160) NOT NULL, "position" integer NOT NULL CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "poll_options_position_unique" ON "poll_options" ("poll_id", "position");
CREATE TABLE "votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "poll_id" uuid NOT NULL REFERENCES "polls"("id") ON DELETE CASCADE,
  "option_id" uuid REFERENCES "poll_options"("id") ON DELETE RESTRICT, "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "private_answer" text, "private_comment" text, "accepted" boolean NOT NULL DEFAULT true, "risk_score" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CHECK (("option_id" IS NOT NULL AND "private_answer" IS NULL) OR ("option_id" IS NULL AND "private_answer" IS NOT NULL)),
  CHECK (char_length("private_answer") <= 2000), CHECK (char_length("private_comment") <= 1000), CHECK ("risk_score" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "votes_poll_user_unique" ON "votes" ("poll_id", "user_id");
CREATE INDEX "votes_poll_idx" ON "votes" ("poll_id");
CREATE TABLE "analytics_access" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "role" analytics_role NOT NULL,
  "granted_at" timestamptz NOT NULL DEFAULT now(), PRIMARY KEY ("user_id", "role")
);
