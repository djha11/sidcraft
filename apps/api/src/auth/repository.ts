import type { LoginRequest, PublicUser, RegisterRequest } from "@pulse/contracts";

export type StoredUser = PublicUser & { passwordHash: string };
export type StoredSession = { id: string; userId: string; refreshTokenHash: string; tokenFamilyId: string; expiresAt: Date; revokedAt: Date | null };
export type OtpPurpose = "signup" | "password_reset";
export type StoredOtp = { id: string; email: string; purpose: OtpPurpose; codeHash: string; expiresAt: Date; consumedAt: Date | null; attempts: number; createdAt: Date };
export interface AuthRepository {
  findByEmail(email: string): Promise<StoredUser | null>;
  findById(id: string): Promise<StoredUser | null>;
  handleExists(handle: string): Promise<boolean>;
  createOtp(input: Pick<StoredOtp, "email" | "purpose" | "codeHash" | "expiresAt">): Promise<StoredOtp>;
  latestOtp(email: string, purpose: OtpPurpose): Promise<StoredOtp | null>;
  incrementOtpAttempts(id: string): Promise<void>;
  consumeOtp(id: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  create(input: RegisterRequest & { passwordHash: string; handle: string }): Promise<StoredUser>;
  createSession(input: Omit<StoredSession, "id" | "revokedAt">): Promise<StoredSession>;
  findSession(id: string): Promise<StoredSession | null>;
  rotateSession(oldId: string, input: Omit<StoredSession, "id" | "revokedAt">): Promise<StoredSession>;
  revokeSession(id: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

export class MemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly otps = new Map<string, StoredOtp>();
  async findByEmail(email: LoginRequest["email"]): Promise<StoredUser | null> { return this.users.get(email) ?? null; }
  async findById(id: string): Promise<StoredUser | null> { return [...this.users.values()].find((user) => user.id === id) ?? null; }
  async handleExists(handle: string): Promise<boolean> { return [...this.users.values()].some((user) => user.handle === handle); }
  async createOtp(input: Pick<StoredOtp, "email" | "purpose" | "codeHash" | "expiresAt">) { const row: StoredOtp = { ...input, id: crypto.randomUUID(), attempts: 0, consumedAt: null, createdAt: new Date() }; this.otps.set(row.id, row); return row; }
  async latestOtp(email: string, purpose: OtpPurpose) { return [...this.otps.values()].filter((row) => row.email === email && row.purpose === purpose).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null; }
  async incrementOtpAttempts(id: string) { const row = this.otps.get(id); if (row) this.otps.set(id, { ...row, attempts: row.attempts + 1 }); }
  async consumeOtp(id: string) { const row = this.otps.get(id); if (row) this.otps.set(id, { ...row, consumedAt: new Date() }); }
  async updatePassword(userId: string, passwordHash: string) { const row = await this.findById(userId); if (row) this.users.set(row.email, { ...row, passwordHash }); }
  async create(input: RegisterRequest & { passwordHash: string; handle: string }): Promise<StoredUser> {
    if (this.users.has(input.email)) throw new Error("EMAIL_EXISTS");
    if (await this.handleExists(input.handle)) throw new Error("USERNAME_TAKEN");
    const user: StoredUser = { id: crypto.randomUUID(), email: input.email, displayName: input.displayName, handle: input.handle, createdAt: new Date().toISOString(), passwordHash: input.passwordHash };
    this.users.set(input.email, user); return user;
  }
  async createSession(input: Omit<StoredSession, "id" | "revokedAt">): Promise<StoredSession> { const session = { ...input, id: crypto.randomUUID(), revokedAt: null }; this.sessions.set(session.id, session); return session; }
  async findSession(id: string) { return this.sessions.get(id) ?? null; }
  async rotateSession(oldId: string, input: Omit<StoredSession, "id" | "revokedAt">) { await this.revokeSession(oldId); return this.createSession(input); }
  async revokeSession(id: string) { const current = this.sessions.get(id); if (current) this.sessions.set(id, { ...current, revokedAt: new Date() }); }
  async revokeFamily(familyId: string) { for (const [id, session] of this.sessions) if (session.tokenFamilyId === familyId) this.sessions.set(id, { ...session, revokedAt: new Date() }); }
}
