CREATE TYPE "email_otp_purpose" AS ENUM ('signup', 'password_reset');
CREATE TABLE "email_otp_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(254) NOT NULL,
  "purpose" "email_otp_purpose" NOT NULL,
  "code_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "attempts" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "email_otp_lookup_idx" ON "email_otp_challenges" ("email", "purpose", "created_at");
