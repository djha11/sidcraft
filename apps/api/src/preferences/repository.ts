import { eq } from "drizzle-orm";
import { userPreferences, type Database } from "@pulse/database";
import {
  userPreferencesSchema,
  type UpdateUserPreferences,
  type UserPreferences,
} from "@pulse/contracts";

export const defaultPreferences = userPreferencesSchema.parse({});

export interface PreferencesRepository {
  get(userId: string): Promise<UserPreferences>;
  update(
    userId: string,
    patch: UpdateUserPreferences,
  ): Promise<UserPreferences>;
}

export class MemoryPreferencesRepository implements PreferencesRepository {
  private readonly rows = new Map<string, UserPreferences>();
  async get(userId: string) {
    return this.rows.get(userId) ?? defaultPreferences;
  }
  async update(userId: string, patch: UpdateUserPreferences) {
    const next = userPreferencesSchema.parse({
      ...(await this.get(userId)),
      ...patch,
    });
    this.rows.set(userId, next);
    return next;
  }
}

export class DrizzlePreferencesRepository implements PreferencesRepository {
  constructor(private readonly db: Database) {}
  async get(userId: string) {
    const [row] = await this.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    return userPreferencesSchema.parse({
      ...defaultPreferences,
      ...((row?.settings as object | undefined) ?? {}),
    });
  }
  async update(userId: string, patch: UpdateUserPreferences) {
    const next = userPreferencesSchema.parse({
      ...(await this.get(userId)),
      ...patch,
    });
    await this.db
      .insert(userPreferences)
      .values({ userId, settings: next, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { settings: next, updatedAt: new Date() },
      });
    return next;
  }
}
