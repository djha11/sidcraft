import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function register(api: FastifyInstance) {
  const email = "settings@example.com";
  const otp = (
    await api.inject({
      method: "POST",
      url: "/v1/auth/otp",
      payload: { email, purpose: "signup" },
    })
  ).json().developmentOtp;
  return (
    await api.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        displayName: "Settings User",
        password: "correct horse battery staple",
        acceptedTerms: true,
        otp,
      },
    })
  ).json();
}

describe("profile preferences", () => {
  it("returns defaults, validates updates, and persists an account setting", async () => {
    app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        JWT_SECRET: "test-secret-that-is-at-least-thirty-two-chars",
      }),
    );
    const account = await register(app);
    const headers = { authorization: `Bearer ${account.accessToken}` };
    const defaults = await app.inject({
      method: "GET",
      url: "/v1/me/preferences",
      headers,
    });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json()).toMatchObject({
      allowComments: true,
      allowSharing: true,
      sensitiveContent: "Standard",
    });

    const updated = await app.inject({
      method: "PATCH",
      url: "/v1/me/preferences",
      headers,
      payload: {
        allowComments: false,
        allowSharing: false,
        dailyLimit: "1 hour",
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      allowComments: false,
      allowSharing: false,
      dailyLimit: "1 hour",
    });
    expect(
      (
        await app.inject({ method: "GET", url: "/v1/me/preferences", headers })
      ).json(),
    ).toEqual(updated.json());

    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/v1/me/preferences",
          headers,
          payload: { unknown: true },
        })
      ).statusCode,
    ).toBe(400);
  });
});
