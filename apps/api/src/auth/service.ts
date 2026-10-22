import { compare, hash } from "bcryptjs";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { LoginRequest, PublicUser, RegisterRequest } from "@pulse/contracts";
import type { AuthRepository, StoredUser } from "./repository.js";
import type { EmailSender } from "./email.js";

export class AuthError extends Error { constructor(public readonly code: "EMAIL_EXISTS" | "USERNAME_TAKEN" | "INVALID_CREDENTIALS" | "INVALID_REFRESH_TOKEN" | "REFRESH_TOKEN_REUSED" | "INVALID_OTP" | "OTP_EXPIRED" | "OTP_LOCKED" | "OTP_RESEND_TOO_SOON") { super(code); } }
const publicUser = ({ passwordHash: _, ...user }: StoredUser): PublicUser => user;
const usernameBase = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 22) || "member";

export class AuthService {
  constructor(private readonly repository: AuthRepository, private readonly emailSender: EmailSender, private readonly otpSecret: string, private readonly exposeDevelopmentOtp = false) {}
  private otpHash(email: string, purpose: "signup" | "password_reset", code: string) { return createHmac("sha256", this.otpSecret).update(`${email}:${purpose}:${code}`).digest("hex"); }
  async requestOtp(email: string, purpose: "signup" | "password_reset") {
    const user = await this.repository.findByEmail(email);
    if (purpose === "signup" && user) throw new AuthError("EMAIL_EXISTS");
    const latest = await this.repository.latestOtp(email, purpose);
    if (latest && Date.now() - latest.createdAt.getTime() < 60_000) throw new AuthError("OTP_RESEND_TOO_SOON");
    if (purpose === "password_reset" && !user) return { sent: true, expiresInSeconds: 600 };
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.repository.createOtp({ email, purpose, codeHash: this.otpHash(email, purpose, code), expiresAt: new Date(Date.now() + 600_000) });
    await this.emailSender.sendOtp({ email, code, purpose, expiresMinutes: 10 });
    return { sent: true, expiresInSeconds: 600, ...(this.exposeDevelopmentOtp ? { developmentOtp: code } : {}) };
  }
  private async verifyOtp(email: string, purpose: "signup" | "password_reset", code: string) {
    const challenge = await this.repository.latestOtp(email, purpose);
    if (!challenge || challenge.consumedAt) throw new AuthError("INVALID_OTP");
    if (challenge.attempts >= 5) throw new AuthError("OTP_LOCKED");
    if (challenge.expiresAt.getTime() <= Date.now()) throw new AuthError("OTP_EXPIRED");
    const actual = Buffer.from(challenge.codeHash, "hex"); const supplied = Buffer.from(this.otpHash(email, purpose, code), "hex");
    if (actual.length !== supplied.length || !timingSafeEqual(actual, supplied)) { await this.repository.incrementOtpAttempts(challenge.id); throw new AuthError("INVALID_OTP"); }
    return challenge;
  }
  async usernameAvailability(username?: string, displayName?: string) {
    const normalized = username?.trim().toLowerCase() ?? null;
    const available = normalized ? !(await this.repository.handleExists(normalized)) : null;
    const base = usernameBase(displayName || normalized || "member");
    const candidates = [base, `${base}.official`, `${base}_in`, `${base}${new Date().getFullYear()}`, `${base}${Math.floor(10 + Math.random() * 90)}`]
      .map((candidate) => candidate.slice(0, 30).replace(/[._]+$/g, ""))
      .filter((candidate, index, all) => candidate.length >= 3 && all.indexOf(candidate) === index && candidate !== normalized);
    const availability = await Promise.all(candidates.map(async (candidate) => ({ candidate, free: !(await this.repository.handleExists(candidate)) })));
    return { username: normalized, available, suggestions: availability.filter((item) => item.free).slice(0, 4).map((item) => item.candidate) };
  }
  async register(input: RegisterRequest): Promise<PublicUser> {
    if (await this.repository.findByEmail(input.email)) throw new AuthError("EMAIL_EXISTS");
    const challenge = await this.verifyOtp(input.email, "signup", input.otp);
    const handle = input.username ?? (await this.usernameAvailability(undefined, input.displayName)).suggestions[0] ?? `${usernameBase(input.displayName)}${crypto.randomUUID().slice(0, 6)}`;
    if (await this.repository.handleExists(handle)) throw new AuthError("USERNAME_TAKEN");
    const passwordHash = await hash(input.password, 12);
    try { const created = publicUser(await this.repository.create({ ...input, passwordHash, handle })); await this.repository.consumeOtp(challenge.id); return created; }
    catch (error) { if (error instanceof Error && (error.message === "EMAIL_EXISTS" || error.message === "USERNAME_TAKEN")) throw new AuthError(error.message); throw error; }
  }
  async resetPassword(input: { email: string; otp: string; password: string }) {
    const challenge = await this.verifyOtp(input.email, "password_reset", input.otp);
    const user = await this.repository.findByEmail(input.email); if (!user) throw new AuthError("INVALID_OTP");
    await this.repository.updatePassword(user.id, await hash(input.password, 12)); await this.repository.consumeOtp(challenge.id);
  }
  async login(input: LoginRequest): Promise<PublicUser> {
    const user = await this.repository.findByEmail(input.email);
    if (!user || !(await compare(input.password, user.passwordHash))) throw new AuthError("INVALID_CREDENTIALS");
    return publicUser(user);
  }
  async createRefreshSession(userId: string) {
    const secret = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
    const tokenFamilyId = crypto.randomUUID();
    const session = await this.repository.createSession({ userId, refreshTokenHash: await hash(secret, 12), tokenFamilyId, expiresAt: new Date(Date.now() + 30 * 86400_000) });
    return `${session.id}.${secret}`;
  }
  async rotateRefreshToken(token: string): Promise<{ refreshToken: string; user: PublicUser }> {
    const [id, secret] = token.split("."); if (!id || !secret) throw new AuthError("INVALID_REFRESH_TOKEN");
    const session = await this.repository.findSession(id); if (!session) throw new AuthError("INVALID_REFRESH_TOKEN");
    if (session.revokedAt) { await this.repository.revokeFamily(session.tokenFamilyId); throw new AuthError("REFRESH_TOKEN_REUSED"); }
    if (session.expiresAt <= new Date() || !(await compare(secret, session.refreshTokenHash))) throw new AuthError("INVALID_REFRESH_TOKEN");
    const nextSecret = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
    const next = await this.repository.rotateSession(session.id, { userId: session.userId, refreshTokenHash: await hash(nextSecret, 12), tokenFamilyId: session.tokenFamilyId, expiresAt: new Date(Date.now() + 30 * 86400_000) });
    const user = await this.repository.findById(session.userId); if (!user) throw new AuthError("INVALID_REFRESH_TOKEN");
    return { refreshToken: `${next.id}.${nextSecret}`, user: publicUser(user) };
  }
  async logout(token: string) { const [id] = token.split("."); if (id) await this.repository.revokeSession(id); }
}
