import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { newsCandidates, newsSources, type Database } from "@pulse/database";
import type { PublicationCategory } from "@pulse/contracts";
import { storySimilarity } from "./draft.js";

export type NewsSource = {
  id: string;
  name: string;
  feedUrl: string;
  websiteUrl: string | null;
  category: PublicationCategory;
  enabled: boolean;
  pollingMinutes: number;
  lastFetchedAt: string | null;
  lastError: string | null;
  createdAt: string;
};
export type NewsCandidate = {
  id: string;
  sourceId: string;
  sourceName: string;
  category: PublicationCategory;
  sourceUrl: string;
  originalHeadline: string;
  description: string;
  suggestedMediaUrl: string | null;
  storyId: string;
  draftMethod: string;
  sourcePublishedAt: string | null;
  status: "needs_review" | "publishing" | "rejected" | "published";
  finalHeadline: string | null;
  finalSummary: string | null;
  mediaUrl: string | null;
  mediaAttribution: string | null;
  publicationId: string | null;
  createdAt: string;
};
export type SourceInput = Pick<
  NewsSource,
  "name" | "feedUrl" | "websiteUrl" | "category" | "enabled" | "pollingMinutes"
>;
export type SourcePatch = {
  [K in keyof SourceInput]?: SourceInput[K] | undefined;
};
export type CandidateInput = Pick<
  NewsCandidate,
  | "sourceId"
  | "sourceUrl"
  | "originalHeadline"
  | "description"
  | "suggestedMediaUrl"
  | "sourcePublishedAt"
> &
  Pick<NewsCandidate, "finalHeadline" | "finalSummary" | "draftMethod">;
export type ReviewInput = Pick<
  NewsCandidate,
  "finalHeadline" | "finalSummary" | "mediaUrl" | "mediaAttribution"
>;

export interface NewsAutomationRepository {
  sources(): Promise<NewsSource[]>;
  source(id: string): Promise<NewsSource | null>;
  addSource(input: SourceInput): Promise<NewsSource>;
  updateSource(id: string, patch: SourcePatch): Promise<NewsSource | null>;
  recordFetch(id: string, error: string | null): Promise<void>;
  candidates(): Promise<NewsCandidate[]>;
  candidate(id: string): Promise<NewsCandidate | null>;
  candidateBySourceUrl(url: string): Promise<NewsCandidate | null>;
  ingest(
    input: CandidateInput,
  ): Promise<{ candidate: NewsCandidate; created: boolean }>;
  review(id: string, patch: ReviewInput): Promise<NewsCandidate | null>;
  reject(id: string): Promise<NewsCandidate | null>;
  reservePublication(
    id: string,
  ): Promise<"reserved" | "closed" | "story_limit">;
  releasePublication(id: string): Promise<void>;
  markPublished(
    id: string,
    publicationId: string,
  ): Promise<NewsCandidate | null>;
}

export class MemoryNewsAutomationRepository implements NewsAutomationRepository {
  private readonly sourceRows = new Map<string, NewsSource>();
  private readonly candidateRows = new Map<string, NewsCandidate>();
  async sources() {
    return [...this.sourceRows.values()];
  }
  async source(id: string) {
    return this.sourceRows.get(id) ?? null;
  }
  async addSource(input: SourceInput) {
    if (
      [...this.sourceRows.values()].some((row) => row.feedUrl === input.feedUrl)
    )
      throw new Error("SOURCE_EXISTS");
    const row: NewsSource = {
      ...input,
      id: randomUUID(),
      lastFetchedAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
    };
    this.sourceRows.set(row.id, row);
    return row;
  }
  async updateSource(id: string, patch: SourcePatch) {
    const row = await this.source(id);
    if (!row) return null;
    const next = {
      ...row,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ),
    } as NewsSource;
    this.sourceRows.set(id, next);
    return next;
  }
  async recordFetch(id: string, error: string | null) {
    const row = await this.source(id);
    if (row)
      this.sourceRows.set(id, {
        ...row,
        lastFetchedAt: new Date().toISOString(),
        lastError: error,
      });
  }
  async candidates() {
    return [...this.candidateRows.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  async candidate(id: string) {
    return this.candidateRows.get(id) ?? null;
  }
  async candidateBySourceUrl(url: string) {
    return (
      [...this.candidateRows.values()].find((row) => row.sourceUrl === url) ??
      null
    );
  }
  async ingest(input: CandidateInput) {
    const prior = [...this.candidateRows.values()].find(
      (row) => row.sourceUrl === input.sourceUrl,
    );
    if (prior) return { candidate: prior, created: false };
    const source = await this.source(input.sourceId);
    if (!source) throw new Error("SOURCE_NOT_FOUND");
    const related = [...this.candidateRows.values()].find(
      (row) =>
        Date.now() - new Date(row.createdAt).getTime() < 30 * 86400_000 &&
        (storySimilarity(row.originalHeadline, input.originalHeadline) >=
          0.75 ||
          (row.description.length >= 60 &&
            input.description.length >= 60 &&
            storySimilarity(row.description, input.description) >= 0.82)),
    );
    const candidate: NewsCandidate = {
      ...input,
      id: randomUUID(),
      sourceName: source.name,
      category: source.category,
      storyId: related?.storyId ?? randomUUID(),
      status: "needs_review",
      finalHeadline: input.finalHeadline,
      finalSummary: input.finalSummary,
      mediaUrl: null,
      mediaAttribution: null,
      publicationId: null,
      createdAt: new Date().toISOString(),
    };
    this.candidateRows.set(candidate.id, candidate);
    return { candidate, created: true };
  }
  async review(id: string, patch: ReviewInput) {
    const row = await this.candidate(id);
    if (!row || row.status !== "needs_review") return null;
    const next = { ...row, ...patch };
    this.candidateRows.set(id, next);
    return next;
  }
  async reject(id: string) {
    const row = await this.candidate(id);
    if (!row || row.status !== "needs_review") return null;
    const next = { ...row, status: "rejected" as const };
    this.candidateRows.set(id, next);
    return next;
  }
  async reservePublication(
    id: string,
  ): Promise<"reserved" | "closed" | "story_limit"> {
    const row = await this.candidate(id);
    if (!row || row.status !== "needs_review") return "closed";
    if (
      [...this.candidateRows.values()].filter(
        (item) =>
          item.storyId === row.storyId &&
          ["publishing", "published"].includes(item.status),
      ).length >= 2
    )
      return "story_limit";
    this.candidateRows.set(id, { ...row, status: "publishing" });
    return "reserved";
  }
  async releasePublication(id: string) {
    const row = await this.candidate(id);
    if (row?.status === "publishing")
      this.candidateRows.set(id, { ...row, status: "needs_review" });
  }
  async markPublished(id: string, publicationId: string) {
    const row = await this.candidate(id);
    if (!row || row.status !== "publishing") return null;
    const next = { ...row, status: "published" as const, publicationId };
    this.candidateRows.set(id, next);
    return next;
  }
}

export class DrizzleNewsAutomationRepository implements NewsAutomationRepository {
  constructor(private readonly db: Database) {}
  private presentSource(row: typeof newsSources.$inferSelect): NewsSource {
    return {
      ...row,
      lastFetchedAt: row.lastFetchedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
  private async presentCandidate(
    row: typeof newsCandidates.$inferSelect,
  ): Promise<NewsCandidate> {
    const source = await this.source(row.sourceId);
    if (!source) throw new Error("SOURCE_NOT_FOUND");
    return {
      ...row,
      sourceName: source.name,
      category: source.category,
      status: row.status as NewsCandidate["status"],
      sourcePublishedAt: row.sourcePublishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
  async sources() {
    return (
      await this.db
        .select()
        .from(newsSources)
        .orderBy(desc(newsSources.createdAt))
    ).map((row) => this.presentSource(row));
  }
  async source(id: string) {
    const [row] = await this.db
      .select()
      .from(newsSources)
      .where(eq(newsSources.id, id))
      .limit(1);
    return row ? this.presentSource(row) : null;
  }
  async addSource(input: SourceInput) {
    const [row] = await this.db.insert(newsSources).values(input).returning();
    if (!row) throw new Error("SOURCE_CREATE_FAILED");
    return this.presentSource(row);
  }
  async updateSource(id: string, patch: SourcePatch) {
    const [row] = await this.db
      .update(newsSources)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(newsSources.id, id))
      .returning();
    return row ? this.presentSource(row) : null;
  }
  async recordFetch(id: string, error: string | null) {
    await this.db
      .update(newsSources)
      .set({ lastFetchedAt: new Date(), lastError: error })
      .where(eq(newsSources.id, id));
  }
  async candidates() {
    const rows = await this.db
      .select()
      .from(newsCandidates)
      .orderBy(desc(newsCandidates.createdAt))
      .limit(200);
    return Promise.all(rows.map((row) => this.presentCandidate(row)));
  }
  async candidate(id: string) {
    const [row] = await this.db
      .select()
      .from(newsCandidates)
      .where(eq(newsCandidates.id, id))
      .limit(1);
    return row ? this.presentCandidate(row) : null;
  }
  async candidateBySourceUrl(url: string) {
    const [row] = await this.db
      .select()
      .from(newsCandidates)
      .where(eq(newsCandidates.sourceUrl, url))
      .limit(1);
    return row ? this.presentCandidate(row) : null;
  }
  async ingest(input: CandidateInput) {
    const source = await this.source(input.sourceId);
    if (!source) throw new Error("SOURCE_NOT_FOUND");
    const inserted = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('pulse_news_story_ingest'))`,
      );
      const recent = await tx
        .select({
          storyId: newsCandidates.storyId,
          originalHeadline: newsCandidates.originalHeadline,
          description: newsCandidates.description,
        })
        .from(newsCandidates)
        .where(sql`${newsCandidates.createdAt} > now() - interval '30 days'`)
        .orderBy(desc(newsCandidates.createdAt))
        .limit(5000);
      const related = recent.find(
        (row) =>
          storySimilarity(row.originalHeadline, input.originalHeadline) >=
            0.75 ||
          (row.description.length >= 60 &&
            input.description.length >= 60 &&
            storySimilarity(row.description, input.description) >= 0.82),
      );
      const [row] = await tx
        .insert(newsCandidates)
        .values({
          ...input,
          storyId: related?.storyId ?? randomUUID(),
          sourcePublishedAt: input.sourcePublishedAt
            ? new Date(input.sourcePublishedAt)
            : null,
        })
        .onConflictDoNothing({ target: newsCandidates.sourceUrl })
        .returning();
      return row;
    });
    if (inserted)
      return {
        candidate: await this.presentCandidate(inserted),
        created: true,
      };
    const [prior] = await this.db
      .select()
      .from(newsCandidates)
      .where(eq(newsCandidates.sourceUrl, input.sourceUrl))
      .limit(1);
    if (!prior) throw new Error("CANDIDATE_INGEST_FAILED");
    return { candidate: await this.presentCandidate(prior), created: false };
  }
  async review(id: string, patch: ReviewInput) {
    const [row] = await this.db
      .update(newsCandidates)
      .set({ ...patch, reviewedAt: new Date() })
      .where(
        and(
          eq(newsCandidates.id, id),
          eq(newsCandidates.status, "needs_review"),
        ),
      )
      .returning();
    return row ? this.presentCandidate(row) : null;
  }
  async reject(id: string) {
    const [row] = await this.db
      .update(newsCandidates)
      .set({ status: "rejected", reviewedAt: new Date() })
      .where(
        and(
          eq(newsCandidates.id, id),
          eq(newsCandidates.status, "needs_review"),
        ),
      )
      .returning();
    return row ? this.presentCandidate(row) : null;
  }
  async reservePublication(
    id: string,
  ): Promise<"reserved" | "closed" | "story_limit"> {
    return this.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(newsCandidates)
        .where(eq(newsCandidates.id, id))
        .limit(1);
      if (!candidate || candidate.status !== "needs_review")
        return "closed" as const;
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${candidate.storyId}::text))`,
      );
      const [total] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(newsCandidates)
        .where(
          and(
            eq(newsCandidates.storyId, candidate.storyId),
            inArray(newsCandidates.status, ["publishing", "published"]),
          ),
        );
      if ((total?.count ?? 0) >= 2) return "story_limit" as const;
      const [reserved] = await tx
        .update(newsCandidates)
        .set({ status: "publishing" })
        .where(
          and(
            eq(newsCandidates.id, id),
            eq(newsCandidates.status, "needs_review"),
          ),
        )
        .returning();
      return reserved ? ("reserved" as const) : ("closed" as const);
    });
  }
  async releasePublication(id: string) {
    await this.db
      .update(newsCandidates)
      .set({ status: "needs_review" })
      .where(
        and(eq(newsCandidates.id, id), eq(newsCandidates.status, "publishing")),
      );
  }
  async markPublished(id: string, publicationId: string) {
    const [row] = await this.db
      .update(newsCandidates)
      .set({ status: "published", publicationId, reviewedAt: new Date() })
      .where(
        and(eq(newsCandidates.id, id), eq(newsCandidates.status, "publishing")),
      )
      .returning();
    return row ? this.presentCandidate(row) : null;
  }
}
