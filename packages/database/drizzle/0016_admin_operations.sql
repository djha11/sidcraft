CREATE TABLE IF NOT EXISTS "platform_settings" (
  "key" varchar(80) PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "value" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "admin_broadcasts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(140) NOT NULL,
  "message" varchar(600) NOT NULL,
  "audience" varchar(40) DEFAULT 'everyone' NOT NULL,
  "status" varchar(16) DEFAULT 'sent' NOT NULL,
  "deep_link" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
