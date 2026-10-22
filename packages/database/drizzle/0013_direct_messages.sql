DO $$ BEGIN
 CREATE TYPE "public"."conversation_status" AS ENUM('requested', 'accepted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_one_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "user_two_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "requested_for_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "conversation_status" DEFAULT 'requested' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "conversations_different_users" CHECK ("user_one_id" <> "user_two_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_pair_unique" ON "conversations" USING btree ("user_one_id", "user_two_id");
CREATE INDEX IF NOT EXISTS "conversations_one_updated_idx" ON "conversations" USING btree ("user_one_id", "updated_at");
CREATE INDEX IF NOT EXISTS "conversations_two_updated_idx" ON "conversations" USING btree ("user_two_id", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "direct_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "sender_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "body" varchar(1000) NOT NULL,
  "read_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_messages_conversation_created_idx" ON "direct_messages" USING btree ("conversation_id", "created_at");
