import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });
const setup = async () => app = await buildApp(loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-that-is-at-least-thirty-two-chars" }));
const account = { email: "arjun@example.com", password: "correct horse battery staple", displayName: "Arjun Kapoor", acceptedTerms: true };
async function verifiedRegistration(api: FastifyInstance, input = account) { const otp = (await api.inject({ method: "POST", url: "/v1/auth/otp", payload: { email: input.email, purpose: "signup" } })).json().developmentOtp; return api.inject({ method: "POST", url: "/v1/auth/register", payload: { ...input, otp } }); }

describe("authentication", () => {
  it("registers and logs in a user without exposing the password hash", async () => {
    const api = await setup();
    const registered = await verifiedRegistration(api);
    expect(registered.statusCode).toBe(201);
    expect(registered.json()).toMatchObject({ user: { email: account.email, displayName: account.displayName }, accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(registered.body).not.toContain("passwordHash");
    const login = await api.inject({ method: "POST", url: "/v1/auth/login", payload: { email: account.email, password: account.password } });
    expect(login.statusCode).toBe(200);
  });
  it("rejects duplicate registration and invalid credentials", async () => {
    const api = await setup();
    await verifiedRegistration(api);
    expect((await api.inject({ method: "POST", url: "/v1/auth/register", payload: { ...account, otp: "000000" } })).statusCode).toBe(409);
    expect((await api.inject({ method: "POST", url: "/v1/auth/login", payload: { email: account.email, password: "wrong-password" } })).statusCode).toBe(401);
  });
  it("suggests usernames, reports live availability, and prevents duplicate handles", async () => {
    const api = await setup();
    const suggestions = await api.inject({ method: "GET", url: "/v1/auth/username?displayName=Arjun%20Kapoor" });
    expect(suggestions.statusCode).toBe(200);
    expect(suggestions.json().suggestions).toContain("arjunkapoor");
    const first = await verifiedRegistration(api, { ...account, username: "arjun.kapoor" } as typeof account);
    expect(first.statusCode).toBe(201);
    expect(first.json().user.handle).toBe("arjun.kapoor");
    const check = await api.inject({ method: "GET", url: "/v1/auth/username?username=arjun.kapoor&displayName=Arjun%20Kapoor" });
    expect(check.statusCode).toBe(200);
    expect(check.json()).toMatchObject({ username: "arjun.kapoor", available: false });
    const duplicate = await verifiedRegistration(api, { ...account, email: "another@example.com", username: "arjun.kapoor" } as typeof account);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: "USERNAME_TAKEN" });
  });
  it("rotates refresh tokens and detects reuse", async () => {
    const api = await setup();
    const registered = (await verifiedRegistration(api)).json();
    const refreshed = await api.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: registered.refreshToken } });
    expect(refreshed.statusCode).toBe(200); expect(refreshed.json().refreshToken).not.toBe(registered.refreshToken);
    const reused = await api.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refreshToken: registered.refreshToken } });
    expect(reused.statusCode).toBe(401); expect(reused.json()).toEqual({ error: "REFRESH_TOKEN_REUSED" });
  });
  it("requires email verification and resets a forgotten password with a single-use OTP", async () => {
    const api = await setup();
    const otpResponse = await api.inject({ method: "POST", url: "/v1/auth/otp", payload: { email: account.email, purpose: "signup" } });
    const signupOtp = otpResponse.json().developmentOtp as string;
    const badSignup = await api.inject({ method: "POST", url: "/v1/auth/register", payload: { ...account, otp: "000000" } });
    expect(badSignup.statusCode).toBe(400); expect(badSignup.json()).toEqual({ error: "INVALID_OTP" });
    expect((await api.inject({ method: "POST", url: "/v1/auth/register", payload: { ...account, otp: signupOtp } })).statusCode).toBe(201);
    const resetRequest = await api.inject({ method: "POST", url: "/v1/auth/otp", payload: { email: account.email, purpose: "password_reset" } });
    const resetOtp = resetRequest.json().developmentOtp as string; const nextPassword = "a completely new password";
    expect((await api.inject({ method: "POST", url: "/v1/auth/password/reset", payload: { email: account.email, otp: resetOtp, password: nextPassword, confirmPassword: nextPassword } })).statusCode).toBe(204);
    expect((await api.inject({ method: "POST", url: "/v1/auth/login", payload: { email: account.email, password: account.password } })).statusCode).toBe(401);
    expect((await api.inject({ method: "POST", url: "/v1/auth/login", payload: { email: account.email, password: nextPassword } })).statusCode).toBe(200);
    expect((await api.inject({ method: "POST", url: "/v1/auth/password/reset", payload: { email: account.email, otp: resetOtp, password: account.password, confirmPassword: account.password } })).statusCode).toBe(400);
  });
});
