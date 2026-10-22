import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });
const adminKey = "test-admin-key-that-is-at-least-32-chars";
const config = loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-that-is-at-least-thirty-two-chars", ADMIN_API_KEY: adminKey });
async function setup() {
  app = await buildApp(config);
  const email = "reader@example.com"; const otp = (await app.inject({ method: "POST", url: "/v1/auth/otp", payload: { email, purpose: "signup" } })).json().developmentOtp;
  const registration = await app.inject({ method: "POST", url: "/v1/auth/register", payload: { email, password: "correct horse battery staple", displayName: "Reader", acceptedTerms: true, otp } });
  return { api: app, token: registration.json().accessToken as string };
}
const payload = { kind: "news", category: "india", headline: "A sourced public-interest headline", summary: "A concise summary with enough context for the public news card.", mediaUrl: "https://images.example.com/story.jpg", sourceName: "Public Record", sourceUrl: "https://example.com/source", evidenceNote: "Primary public record linked by the publisher." };

describe("news and reel publications", () => {
  it("protects admin publishing and requires source attribution", async () => {
    const { api } = await setup();
    expect((await api.inject({ method: "POST", url: "/v1/admin/publications", payload })).statusCode).toBe(401);
    expect((await api.inject({ method: "POST", url: "/v1/admin/publications", headers: { "x-pulse-admin-key": adminKey }, payload: { ...payload, sourceUrl: "" } })).statusCode).toBe(400);
    expect((await api.inject({ method: "POST", url: "/v1/admin/publications", headers: { "x-pulse-admin-key": adminKey }, payload })).statusCode).toBe(201);
  });
  it("serves published news and reels separately to authenticated readers", async () => {
    const { api, token } = await setup();
    const admin = { "x-pulse-admin-key": adminKey };
    await api.inject({ method: "POST", url: "/v1/admin/publications", headers: admin, payload });
    await api.inject({ method: "POST", url: "/v1/admin/publications", headers: admin, payload: { ...payload, kind: "reel", headline: "Reel headline", mediaUrl: "https://video.example.com/reel.mp4" } });
    const news = await api.inject({ method: "GET", url: "/v1/publications?kind=news", headers: { authorization: `Bearer ${token}` } });
    expect(news.statusCode).toBe(200);
    expect(news.json().items).toHaveLength(1);
    expect(news.json().items[0]).toMatchObject({ kind: "news", sourceUrl: "https://example.com/source" });
    const reels = await api.inject({ method: "GET", url: "/v1/publications?kind=reel", headers: { authorization: `Bearer ${token}` } });
    expect(reels.json().items).toHaveLength(1);
  });
  it("preserves ordered media links and allows an omitted evidence note", async () => {
    const { api } = await setup();
    const mediaUrls = ["https://images.example.com/first.jpg", "https://images.example.com/second.jpg", "https://video.example.com/third.mp4"];
    const response = await api.inject({ method: "POST", url: "/v1/admin/publications", headers: { "x-pulse-admin-key": adminKey }, payload: { ...payload, mediaUrl: undefined, mediaUrls, evidenceNote: "" } });
    expect(response.statusCode).toBe(201);
    expect(response.json().media.map((item: { url: string }) => item.url)).toEqual(mediaUrls);
    expect(response.json().evidenceNote).toBe("");
  });
});
