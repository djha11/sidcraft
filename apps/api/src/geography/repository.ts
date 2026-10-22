import { eq } from "drizzle-orm";
import { userLocationPreferences, type Database } from "@pulse/database";

export type SavedLocation = { stateCode: string; lokSabhaConstituencyCode: string | null; source: "device" | "manual"; updatedAt: Date };
export interface LocationRepository { get(userId: string): Promise<SavedLocation | null>; save(userId: string, value: Omit<SavedLocation, "updatedAt">): Promise<SavedLocation>; }
export class MemoryLocationRepository implements LocationRepository {
  private readonly values = new Map<string, SavedLocation>();
  async get(userId: string) { return this.values.get(userId) ?? null; }
  async save(userId: string, value: Omit<SavedLocation, "updatedAt">) { const saved = { ...value, updatedAt: new Date() }; this.values.set(userId, saved); return saved; }
}
export class DrizzleLocationRepository implements LocationRepository {
  constructor(private readonly db: Database) {}
  async get(userId: string) { const [row] = await this.db.select({ stateCode: userLocationPreferences.stateCode, lokSabhaConstituencyCode: userLocationPreferences.lokSabhaConstituencyCode, source: userLocationPreferences.source, updatedAt: userLocationPreferences.updatedAt }).from(userLocationPreferences).where(eq(userLocationPreferences.userId, userId)).limit(1); return row ?? null; }
  async save(userId: string, value: Omit<SavedLocation, "updatedAt">) { const now = new Date(); const [row] = await this.db.insert(userLocationPreferences).values({ userId, ...value, precision: value.lokSabhaConstituencyCode ? "constituency" : "state", consentedAt: now, updatedAt: now }).onConflictDoUpdate({ target: userLocationPreferences.userId, set: { ...value, precision: value.lokSabhaConstituencyCode ? "constituency" : "state", consentedAt: now, updatedAt: now } }).returning({ stateCode: userLocationPreferences.stateCode, lokSabhaConstituencyCode: userLocationPreferences.lokSabhaConstituencyCode, source: userLocationPreferences.source, updatedAt: userLocationPreferences.updatedAt }); if (!row) throw new Error("LOCATION_SAVE_FAILED"); return row; }
}
