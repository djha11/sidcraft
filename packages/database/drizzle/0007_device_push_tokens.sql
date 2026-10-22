CREATE TABLE "device_push_tokens" ("token" varchar(255) PRIMARY KEY, "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "platform" varchar(10) NOT NULL, "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE INDEX "device_push_tokens_user_idx" ON "device_push_tokens" ("user_id");
