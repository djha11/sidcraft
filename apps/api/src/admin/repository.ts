import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  adCampaigns,
  adminBroadcasts,
  feedPosts,
  moderationActions,
  platformSettings,
  profiles,
  publications,
  users,
  verificationRequests,
  type Database,
} from "@pulse/database";

export type VerificationType =
  "general" | "grey" | "government" | "media" | "business";
export type AdminProfile = {
  id: string;
  displayName: string;
  handle: string;
  verificationType: string | null;
  status: string;
};
export type VerificationRequest = {
  id: string;
  userId: string;
  displayName: string;
  handle: string;
  requestedType: VerificationType;
  evidenceUrl: string | null;
  note: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
};
export type AdminContent = {
  id: string;
  kind: "post" | "reel" | "anonymous" | "publication";
  title: string;
  owner: string | null;
  status: string;
  createdAt: string;
};
export type Campaign = {
  id: string;
  name: string;
  advertiser: string;
  headline: string;
  destinationUrl: string;
  mediaUrl: string | null;
  status: string;
  createdAt: string;
};
export type AdminSetting = {
  key: string;
  enabled: boolean;
  value: string | null;
  updatedAt: string;
};
export type Broadcast = {
  id: string;
  title: string;
  message: string;
  audience: string;
  status: string;
  deepLink: string | null;
  createdAt: string;
};
export type Audit = {
  id: string;
  targetType: string;
  targetId: string;
  action: string;
  reason: string;
  createdAt: string;
};

export interface AdminRepository {
  requestVerification(
    userId: string,
    input: {
      requestedType: VerificationType;
      evidenceUrl?: string | null;
      note?: string | null;
    },
  ): Promise<{ id: string; status: string }>;
  myVerification(
    userId: string,
  ): Promise<{
    status: string;
    verificationType: string | null;
    reviewNote: string | null;
  } | null>;
  verificationRequests(): Promise<VerificationRequest[]>;
  profiles(): Promise<AdminProfile[]>;
  setProfileVerification(
    userId: string,
    enabled: boolean,
    type: VerificationType | null,
  ): Promise<void>;
  reviewVerification(
    id: string,
    status: "approved" | "rejected",
    type: VerificationType | null,
    note: string,
  ): Promise<void>;
  content(): Promise<AdminContent[]>;
  moderate(
    kind: string,
    id: string,
    action: "delete" | "warn",
    reason: string,
  ): Promise<void>;
  campaigns(): Promise<Campaign[]>;
  createCampaign(input: Omit<Campaign, "id" | "createdAt">): Promise<Campaign>;
  settings(): Promise<AdminSetting[]>;
  setSetting(
    key: string,
    enabled: boolean,
    value: string | null,
  ): Promise<void>;
  broadcasts(): Promise<Broadcast[]>;
  createBroadcast(input: {
    title: string;
    message: string;
    audience: string;
    deepLink: string | null;
  }): Promise<Broadcast>;
  audits(): Promise<Audit[]>;
}

export class MemoryAdminRepository implements AdminRepository {
  private requests: VerificationRequest[] = [];
  private ads: Campaign[] = [];
  private settingRows = new Map<string, AdminSetting>();
  private broadcastRows: Broadcast[] = [];
  private auditRows: Audit[] = [];
  async requestVerification(
    userId: string,
    input: {
      requestedType: VerificationType;
      evidenceUrl?: string | null;
      note?: string | null;
    },
  ) {
    const row: VerificationRequest = {
      id: randomUUID(),
      userId,
      displayName: "SidCraft user",
      handle: "user",
      requestedType: input.requestedType,
      evidenceUrl: input.evidenceUrl ?? null,
      note: input.note ?? null,
      status: "pending",
      reviewNote: null,
      createdAt: new Date().toISOString(),
    };
    this.requests.unshift(row);
    return { id: row.id, status: row.status };
  }
  async myVerification(userId: string) {
    const row = this.requests.find((r) => r.userId === userId);
    return row
      ? {
          status: row.status,
          verificationType:
            row.status === "approved" ? row.requestedType : null,
          reviewNote: row.reviewNote,
        }
      : null;
  }
  async verificationRequests() {
    return this.requests;
  }
  async profiles() {
    return [];
  }
  async setProfileVerification() {
    return;
  }
  async reviewVerification(
    id: string,
    status: "approved" | "rejected",
    type: VerificationType | null,
    note: string,
  ) {
    const row = this.requests.find((r) => r.id === id);
    if (!row) throw new Error("REQUEST_NOT_FOUND");
    row.status = status;
    row.reviewNote = note;
    if (type) row.requestedType = type;
  }
  async content() {
    return [];
  }
  async moderate(
    kind: string,
    id: string,
    action: "delete" | "warn",
    reason: string,
  ) {
    this.auditRows.unshift({
      id: randomUUID(),
      targetType: kind,
      targetId: id,
      action,
      reason,
      createdAt: new Date().toISOString(),
    });
  }
  async campaigns() {
    return this.ads;
  }
  async createCampaign(input: Omit<Campaign, "id" | "createdAt">) {
    const row = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.ads.unshift(row);
    return row;
  }
  async settings() {
    return [...this.settingRows.values()];
  }
  async setSetting(key: string, enabled: boolean, value: string | null) {
    this.settingRows.set(key, {
      key,
      enabled,
      value,
      updatedAt: new Date().toISOString(),
    });
  }
  async broadcasts() {
    return this.broadcastRows;
  }
  async createBroadcast(input: {
    title: string;
    message: string;
    audience: string;
    deepLink: string | null;
  }) {
    const row = {
      ...input,
      id: randomUUID(),
      status: "sent",
      createdAt: new Date().toISOString(),
    };
    this.broadcastRows.unshift(row);
    return row;
  }
  async audits() {
    return this.auditRows;
  }
}

export class DrizzleAdminRepository implements AdminRepository {
  constructor(private db: Database) {}
  async requestVerification(
    userId: string,
    input: {
      requestedType: VerificationType;
      evidenceUrl?: string | null;
      note?: string | null;
    },
  ) {
    const [row] = await this.db
      .insert(verificationRequests)
      .values({
        userId,
        requestedType: input.requestedType,
        evidenceUrl: input.evidenceUrl,
        note: input.note,
      })
      .returning({
        id: verificationRequests.id,
        status: verificationRequests.status,
      });
    if (!row) throw new Error("REQUEST_FAILED");
    return row;
  }
  async myVerification(userId: string) {
    const [profile] = await this.db
      .select({ verificationType: profiles.verificationType })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    const [row] = await this.db
      .select()
      .from(verificationRequests)
      .where(eq(verificationRequests.userId, userId))
      .orderBy(desc(verificationRequests.createdAt))
      .limit(1);
    return row
      ? {
          status: row.status,
          verificationType: profile?.verificationType ?? null,
          reviewNote: row.reviewNote,
        }
      : profile?.verificationType
        ? {
            status: "approved",
            verificationType: profile.verificationType,
            reviewNote: null,
          }
        : null;
  }
  async verificationRequests() {
    const rows = await this.db
      .select({
        request: verificationRequests,
        displayName: profiles.displayName,
        handle: profiles.handle,
      })
      .from(verificationRequests)
      .innerJoin(profiles, eq(profiles.userId, verificationRequests.userId))
      .orderBy(desc(verificationRequests.createdAt));
    return rows.map(({ request, ...p }) => ({
      ...request,
      ...p,
      requestedType: request.requestedType as VerificationType,
      createdAt: request.createdAt.toISOString(),
    }));
  }
  async profiles() {
    return this.db
      .select({
        id: profiles.userId,
        displayName: profiles.displayName,
        handle: profiles.handle,
        verificationType: profiles.verificationType,
        status: users.status,
      })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .orderBy(profiles.displayName);
  }
  async setProfileVerification(
    userId: string,
    enabled: boolean,
    type: VerificationType | null,
  ) {
    await this.db
      .update(profiles)
      .set({
        verificationType: enabled ? (type ?? "general") : null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, userId));
  }
  async reviewVerification(
    id: string,
    status: "approved" | "rejected",
    type: VerificationType | null,
    note: string,
  ) {
    const [row] = await this.db
      .update(verificationRequests)
      .set({ status, reviewNote: note, reviewedAt: new Date() })
      .where(eq(verificationRequests.id, id))
      .returning();
    if (!row) throw new Error("REQUEST_NOT_FOUND");
    await this.db
      .update(profiles)
      .set({
        verificationType:
          status === "approved" ? (type ?? row.requestedType) : null,
      })
      .where(eq(profiles.userId, row.userId));
  }
  async content() {
    const [posts, pubs] = await Promise.all([
      this.db
        .select({ post: feedPosts, handle: profiles.handle })
        .from(feedPosts)
        .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
        .orderBy(desc(feedPosts.createdAt))
        .limit(100),
      this.db
        .select()
        .from(publications)
        .orderBy(desc(publications.publishedAt))
        .limit(100),
    ]);
    return [
      ...posts.map(({ post, handle }) => ({
        id: post.id,
        kind: (post.isAnonymous ? "anonymous" : "post") as "anonymous" | "post",
        title: post.body,
        owner: post.isAnonymous ? null : `@${handle}`,
        status: post.status,
        createdAt: post.createdAt.toISOString(),
      })),
      ...pubs.map((p) => ({
        id: p.id,
        kind: "publication" as const,
        title: p.headline,
        owner: p.sourceName,
        status: "active",
        createdAt: p.publishedAt.toISOString(),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async moderate(
    kind: string,
    id: string,
    action: "delete" | "warn",
    reason: string,
  ) {
    if (kind === "publication") {
      if (action === "delete")
        await this.db.delete(publications).where(eq(publications.id, id));
    } else
      await this.db
        .update(feedPosts)
        .set({
          status: action === "delete" ? "removed" : "hidden",
          updatedAt: new Date(),
        })
        .where(eq(feedPosts.id, id));
    await this.db
      .insert(moderationActions)
      .values({ targetType: kind, targetId: id, action, reason });
  }
  async campaigns() {
    const rows = await this.db
      .select()
      .from(adCampaigns)
      .orderBy(desc(adCampaigns.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
  async createCampaign(input: Omit<Campaign, "id" | "createdAt">) {
    const [row] = await this.db.insert(adCampaigns).values(input).returning();
    if (!row) throw new Error("CAMPAIGN_CREATE_FAILED");
    return { ...row, createdAt: row.createdAt.toISOString() };
  }
  async settings() {
    const rows = await this.db
      .select()
      .from(platformSettings)
      .orderBy(platformSettings.key);
    return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
  }
  async setSetting(key: string, enabled: boolean, value: string | null) {
    await this.db
      .insert(platformSettings)
      .values({ key, enabled, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { enabled, value, updatedAt: new Date() },
      });
  }
  async broadcasts() {
    const rows = await this.db
      .select()
      .from(adminBroadcasts)
      .orderBy(desc(adminBroadcasts.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
  async createBroadcast(input: {
    title: string;
    message: string;
    audience: string;
    deepLink: string | null;
  }) {
    const [row] = await this.db
      .insert(adminBroadcasts)
      .values(input)
      .returning();
    if (!row) throw new Error("BROADCAST_CREATE_FAILED");
    return { ...row, createdAt: row.createdAt.toISOString() };
  }
  async audits() {
    const rows = await this.db
      .select()
      .from(moderationActions)
      .orderBy(desc(moderationActions.createdAt))
      .limit(200);
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
}
