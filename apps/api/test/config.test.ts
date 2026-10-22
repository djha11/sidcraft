import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("production configuration", () => {
  it("rejects development credentials and non-TLS realtime URLs", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow();
  });

  it("accepts explicit production services and secrets", () => {
    expect(
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://pulse:secret@db.internal:5432/pulse",
        JWT_SECRET: "jwt-secret-that-is-unique-and-at-least-32-characters",
        ADMIN_API_KEY: "admin-key-that-is-unique-and-at-least-32-characters",
        LIVEKIT_PUBLIC_URL: "wss://pulse.livekit.cloud",
        LIVEKIT_API_KEY: "production-key",
        LIVEKIT_API_SECRET: "production-secret",
        RESEND_API_KEY: "re_test_key",
        EMAIL_FROM: "support@pulse.example",
      }),
    ).toMatchObject({
      NODE_ENV: "production",
      LIVEKIT_PUBLIC_URL: "wss://pulse.livekit.cloud",
    });
  });

  it("uses a platform-provided PORT when API_PORT is absent", () => {
    const config = loadConfig({ PORT: "10000" });
    expect(config.API_PORT).toBe(10000);
  });
});
