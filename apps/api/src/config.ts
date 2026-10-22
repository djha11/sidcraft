import "dotenv/config";
import { z } from "zod";

const configSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    DATABASE_URL: z
      .string()
      .url()
      .default("postgresql://pulse:pulse@localhost:5432/pulse"),
    JWT_SECRET: z
      .string()
      .min(32)
      .default("development-only-secret-change-before-production"),
    ADMIN_API_KEY: z
      .string()
      .min(32)
      .default("development-admin-key-change-before-prod"),
    LIVEKIT_URL: z.string().default("http://127.0.0.1:7880"),
    LIVEKIT_PUBLIC_URL: z.string().default("ws://10.0.2.2:7880"),
    LIVEKIT_API_KEY: z.string().min(3).default("devkey"),
    LIVEKIT_API_SECRET: z.string().min(6).default("secret"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().default("onboarding@resend.dev"),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV !== "production") return;
    const invalid = (condition: boolean, path: string, message: string) => {
      if (condition)
        context.addIssue({ code: "custom", path: [path], message });
    };
    invalid(
      config.JWT_SECRET === "development-only-secret-change-before-production",
      "JWT_SECRET",
      "A unique production JWT secret is required",
    );
    invalid(
      config.ADMIN_API_KEY === "development-admin-key-change-before-prod",
      "ADMIN_API_KEY",
      "A unique production admin key is required",
    );
    invalid(
      !config.DATABASE_URL.startsWith("postgresql://") &&
        !config.DATABASE_URL.startsWith("postgres://"),
      "DATABASE_URL",
      "A PostgreSQL connection URL is required",
    );
    invalid(
      !config.LIVEKIT_PUBLIC_URL.startsWith("wss://"),
      "LIVEKIT_PUBLIC_URL",
      "Production LiveKit must use wss://",
    );
    invalid(
      !config.RESEND_API_KEY,
      "RESEND_API_KEY",
      "Production email delivery is required",
    );
  });

export type AppConfig = z.infer<typeof configSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse({
    ...env,
    // Managed container platforms conventionally inject PORT. Keep API_PORT
    // for local compatibility while honoring the platform-provided value.
    API_PORT: env.API_PORT ?? env.PORT,
  });
}
