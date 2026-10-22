import type { FastifyInstance } from "fastify";
import { loginRequestSchema, logoutRequestSchema, refreshRequestSchema, registerRequestSchema, requestEmailOtpSchema, resetPasswordSchema, usernameAvailabilityQuerySchema } from "@pulse/contracts";
import { AuthError, AuthService } from "./service.js";

export async function authRoutes(app: FastifyInstance, options: { service: AuthService }) {
  app.post("/otp", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const parsed = requestEmailOtpSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", issues: parsed.error.issues });
    try { return await options.service.requestOtp(parsed.data.email, parsed.data.purpose); }
    catch (error) { if (error instanceof AuthError && (error.code === "EMAIL_EXISTS" || error.code === "OTP_RESEND_TOO_SOON")) return reply.code(409).send({ error: error.code }); throw error; }
  });
  app.post("/password/reset", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", issues: parsed.error.issues });
    try { await options.service.resetPassword(parsed.data); return reply.code(204).send(); }
    catch (error) { if (error instanceof AuthError && (error.code === "INVALID_OTP" || error.code === "OTP_EXPIRED" || error.code === "OTP_LOCKED")) return reply.code(400).send({ error: error.code }); throw error; }
  });
  app.get("/username", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = usernameAvailabilityQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_USERNAME", issues: parsed.error.issues });
    return options.service.usernameAvailability(parsed.data.username, parsed.data.displayName);
  });
  app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = registerRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST", issues: parsed.error.issues });
    try { const user = await options.service.register(parsed.data); return reply.code(201).send({ user, accessToken: await reply.jwtSign({ sub: user.id }, { expiresIn: "15m" }), refreshToken: await options.service.createRefreshSession(user.id) }); }
    catch (error) { if (error instanceof AuthError) { if (error.code === "EMAIL_EXISTS" || error.code === "USERNAME_TAKEN") return reply.code(409).send({ error: error.code }); if (error.code === "INVALID_OTP" || error.code === "OTP_EXPIRED" || error.code === "OTP_LOCKED") return reply.code(400).send({ error: error.code }); } throw error; }
  });
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    try { const user = await options.service.login(parsed.data); return { user, accessToken: await reply.jwtSign({ sub: user.id }, { expiresIn: "15m" }), refreshToken: await options.service.createRefreshSession(user.id) }; }
    catch (error) { if (error instanceof AuthError) return reply.code(401).send({ error: "INVALID_CREDENTIALS" }); throw error; }
  });
  app.post("/refresh", async (request, reply) => {
    const parsed = refreshRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" });
    try { const result = await options.service.rotateRefreshToken(parsed.data.refreshToken); return { ...result, accessToken: await reply.jwtSign({ sub: result.user.id }, { expiresIn: "15m" }) }; }
    catch (error) { if (error instanceof AuthError) return reply.code(401).send({ error: error.code }); throw error; }
  });
  app.post("/logout", async (request, reply) => { const parsed = logoutRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: "INVALID_REQUEST" }); await options.service.logout(parsed.data.refreshToken); return reply.code(204).send(); });
}
