import { and, desc, eq, sql } from "drizzle-orm";
import { emailOtpChallenges, profiles, sessions, users, type Database } from "@pulse/database";
import type { RegisterRequest } from "@pulse/contracts";
import type { AuthRepository, OtpPurpose, StoredOtp, StoredSession, StoredUser } from "./repository.js";

export class DrizzleAuthRepository implements AuthRepository {
  constructor(private readonly db: Database) {}
  async findByEmail(email: string): Promise<StoredUser | null> {
    const rows = await this.db.select({ id: users.id, email: users.email, passwordHash: users.passwordHash, createdAt: users.createdAt, displayName: profiles.displayName, handle: profiles.handle }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.email, email)).limit(1);
    const row = rows[0];
    return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
  }
  async findById(id: string): Promise<StoredUser | null> {
    const rows = await this.db.select({ id: users.id, email: users.email, passwordHash: users.passwordHash, createdAt: users.createdAt, displayName: profiles.displayName, handle: profiles.handle }).from(users).innerJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, id)).limit(1);
    const row = rows[0]; return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
  }
  async handleExists(handle: string): Promise<boolean> {
    const rows = await this.db.select({ id: profiles.userId }).from(profiles).where(eq(profiles.handle, handle)).limit(1);
    return rows.length > 0;
  }
  async createOtp(input: Pick<StoredOtp, "email" | "purpose" | "codeHash" | "expiresAt">) { const [row] = await this.db.insert(emailOtpChallenges).values(input).returning(); if (!row) throw new Error("OTP_CREATE_FAILED"); return row; }
  async latestOtp(email: string, purpose: OtpPurpose) { const [row] = await this.db.select().from(emailOtpChallenges).where(and(eq(emailOtpChallenges.email, email), eq(emailOtpChallenges.purpose, purpose))).orderBy(desc(emailOtpChallenges.createdAt)).limit(1); return row ?? null; }
  async incrementOtpAttempts(id: string) { await this.db.update(emailOtpChallenges).set({ attempts: sql`${emailOtpChallenges.attempts} + 1` }).where(eq(emailOtpChallenges.id, id)); }
  async consumeOtp(id: string) { await this.db.update(emailOtpChallenges).set({ consumedAt: new Date() }).where(eq(emailOtpChallenges.id, id)); }
  async updatePassword(userId: string, passwordHash: string) { await this.db.transaction(async (tx) => { await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId)); await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId)); }); }
  async create(input: RegisterRequest & { passwordHash: string; handle: string }): Promise<StoredUser> {
    try { return await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(users).values({ email: input.email, passwordHash: input.passwordHash, emailVerified: true, acceptedTermsAt: new Date() }).returning({ id: users.id, email: users.email, passwordHash: users.passwordHash, createdAt: users.createdAt });
      if (!created) throw new Error("USER_CREATE_FAILED");
      const [profile] = await tx.insert(profiles).values({ userId: created.id, displayName: input.displayName, handle: input.handle }).returning({ displayName: profiles.displayName, handle: profiles.handle });
      if (!profile) throw new Error("PROFILE_CREATE_FAILED");
      return { ...created, ...profile, createdAt: created.createdAt.toISOString() };
    }); } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        const constraint = "constraint_name" in error ? String(error.constraint_name) : "constraint" in error ? String(error.constraint) : "";
        throw new Error(constraint.includes("handle") ? "USERNAME_TAKEN" : "EMAIL_EXISTS");
      }
      throw error;
    }
  }
  async createSession(input: Omit<StoredSession, "id" | "revokedAt">): Promise<StoredSession> { const [row] = await this.db.insert(sessions).values(input).returning(); if (!row) throw new Error("SESSION_CREATE_FAILED"); return row; }
  async findSession(id: string): Promise<StoredSession | null> { const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1); return row ?? null; }
  async rotateSession(oldId: string, input: Omit<StoredSession, "id" | "revokedAt">): Promise<StoredSession> { return this.db.transaction(async (tx) => { const [next] = await tx.insert(sessions).values(input).returning(); if (!next) throw new Error("SESSION_CREATE_FAILED"); await tx.update(sessions).set({ revokedAt: new Date(), replacedBySessionId: next.id }).where(eq(sessions.id, oldId)); return next; }); }
  async revokeSession(id: string) { await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, id)); }
  async revokeFamily(familyId: string) { await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenFamilyId, familyId)); }
}
