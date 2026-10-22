import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });
const config = loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-that-is-at-least-thirty-two-chars", ADMIN_API_KEY: "test-admin-key-that-is-at-least-thirty-two" });
async function setup() { app = await buildApp(config); return app; }
async function register(api: FastifyInstance, email = "local@example.com") { const otp = (await api.inject({ method: "POST", url: "/v1/auth/otp", payload: { email, purpose: "signup" } })).json().developmentOtp; const response = await api.inject({ method: "POST", url: "/v1/auth/register", payload: { email, password: "correct horse battery staple", displayName: "Local Voter", acceptedTerms: true, otp } }); return response.json().accessToken as string; }

describe("India geography and private answers", () => {
  it("serves all 543 Lok Sabha constituencies and correct Rajya Sabha state allocations", async () => {
    const api = await setup(); const regions = (await api.inject({ method: "GET", url: "/v1/geography/regions" })).json();
    expect(regions).toHaveLength(36); expect(regions.reduce((sum: number, region: { rajyaSabhaSeats: number }) => sum + region.rajyaSabhaSeats, 0)).toBe(233);
    const counts = await Promise.all(regions.map(async (region: { code: string }) => (await api.inject({ method: "GET", url: `/v1/geography/regions/${region.code}/constituencies` })).json().length));
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(543);
  });
  it("personalizes by consented state and never returns open answers to the public app", async () => {
    const api = await setup(); const accessToken = await register(api); const headers = { authorization: `Bearer ${accessToken}` };
    const saved = await api.inject({ method: "PUT", url: "/v1/me/location", headers, payload: { consent: true, source: "device", stateCode: "MH", lokSabhaConstituencyCode: null } });
    expect(saved.json()).toMatchObject({ stateCode: "MH", precision: "state" });
    const poll = (await api.inject({ method: "GET", url: "/v1/polls/featured", headers })).json(); expect(poll).toMatchObject({ responseType: "open_text", target: { scope: "state", stateCode: "MH" } });
    const answer = "Fix unreliable buses near my college"; const voted = await api.inject({ method: "POST", url: `/v1/polls/${poll.id}/votes`, headers, payload: { answer } });
    expect(voted.statusCode).toBe(201); expect(voted.body).not.toContain(answer); expect(voted.body).not.toContain("answer");
    expect((await api.inject({ method: "GET", url: `/v1/admin/polls/${poll.id}/analytics` })).statusCode).toBe(401);
    const analytics = await api.inject({ method: "GET", url: `/v1/admin/polls/${poll.id}/analytics`, headers: { "x-pulse-admin-key": config.ADMIN_API_KEY } });
    expect(analytics.json().anonymousAnswers[0]).toMatchObject({ answer, comment: null }); expect(analytics.body).not.toContain("userId"); expect(analytics.body).not.toContain("optionId"); expect(analytics.body).not.toContain("stateCode");
  });
  it("enforces admin comment controls", async () => {
    const api = await setup(); const adminHeaders = { "x-pulse-admin-key": config.ADMIN_API_KEY }; const now = Date.now();
    const created = await api.inject({ method: "POST", url: "/v1/admin/polls", headers: adminHeaders, payload: { question: "Which option should be prioritized first?", topic: "Priorities", responseType: "choice", commentMode: "required", options: ["Option A", "Option B"], opensAt: new Date(now - 1000).toISOString(), closesAt: new Date(now + 60_000).toISOString(), target: { scope: "india", stateCode: null, lokSabhaConstituencyCode: null } } });
    expect(created.statusCode).toBe(201); const poll = created.json(); const accessToken = await register(api, "comment@example.com"); const headers = { authorization: `Bearer ${accessToken}` };
    expect((await api.inject({ method: "POST", url: `/v1/polls/${poll.id}/votes`, headers, payload: { optionId: poll.options[0].id } })).json()).toEqual({ error: "COMMENT_REQUIRED" });
    const comment = "This would have the fastest local impact"; const accepted = await api.inject({ method: "POST", url: `/v1/polls/${poll.id}/votes`, headers, payload: { optionId: poll.options[0].id, comment } });
    expect(accepted.statusCode).toBe(201); expect(accepted.body).not.toContain(comment);
  });
});
