import { and, asc, count, desc, eq, gt, lte } from "drizzle-orm";
import { pollOptions, polls, votes, type Database } from "@pulse/database";
import type { CreatePollRequest } from "@pulse/contracts";
import type { AudienceProfile, PollRecord, PollRepository, VoteSubmission } from "./repository.js";

type PollRow = typeof polls.$inferSelect;
export class DrizzlePollRepository implements PollRepository {
  constructor(private readonly db: Database) {}
  private async hydrate(poll: PollRow): Promise<PollRecord> {
    const options = await this.db.select({ id: pollOptions.id, label: pollOptions.label, position: pollOptions.position, mediaUrl:pollOptions.mediaUrl }).from(pollOptions).where(eq(pollOptions.pollId, poll.id)).orderBy(asc(pollOptions.position));
    return { id: poll.id, question: poll.question, topic: poll.topic, opensAt: poll.opensAt, closesAt: poll.closesAt, responseType: poll.responseType, commentMode: poll.commentMode,
      media: poll.mediaKind && poll.mediaUrl ? { kind: poll.mediaKind as "image"|"video", url: poll.mediaUrl, originalName: poll.mediaOriginalName } : null,
      target: { scope: poll.audienceScope, countryCode:poll.targetCountryCode??"IN", stateCode: poll.targetStateCode, lokSabhaConstituencyCode: poll.targetLokSabhaConstituencyCode }, options };
  }
  async list() { const rows=await this.db.select().from(polls).orderBy(desc(polls.createdAt)); return Promise.all(rows.map((row)=>this.hydrate(row))); }
  async getActive(id: string) { const now = new Date(); const [poll] = await this.db.select().from(polls).where(and(eq(polls.id, id), eq(polls.status, "active"), lte(polls.opensAt, now), gt(polls.closesAt, now))).limit(1); return poll ? this.hydrate(poll) : null; }
  async getById(id: string) { const [poll] = await this.db.select().from(polls).where(eq(polls.id, id)).limit(1); return poll ? this.hydrate(poll) : null; }
  async getFeatured(audience: AudienceProfile) {
    const now = new Date(); const rows = await this.db.select().from(polls).where(and(eq(polls.status, "active"), lte(polls.opensAt, now), gt(polls.closesAt, now)));
    const selected = rows.find((poll) => poll.audienceScope === "lok_sabha" && poll.targetLokSabhaConstituencyCode === audience.lokSabhaConstituencyCode)
      ?? rows.find((poll) => poll.audienceScope === "state" && poll.targetStateCode === audience.stateCode)
      ?? rows.find((poll) => poll.audienceScope === "country" && poll.targetCountryCode === audience.countryCode)
      ?? rows.find((poll) => poll.audienceScope === "india" && audience.countryCode === "IN")
      ?? rows.find((poll) => poll.audienceScope === "global");
    return selected ? this.hydrate(selected) : null;
  }
  async findVote(pollId: string, userId: string) { const [row] = await this.db.select({ optionId: votes.optionId, answer: votes.privateAnswer, comment: votes.privateComment, createdAt: votes.createdAt }).from(votes).where(and(eq(votes.pollId, pollId), eq(votes.userId, userId))).limit(1); return row ?? null; }
  async vote(pollId: string, userId: string, submission: VoteSubmission) { try { await this.db.insert(votes).values({ pollId, userId, optionId: submission.optionId ?? null, privateAnswer: submission.answer ?? null, privateComment: submission.comment ?? null }); } catch (error) { if (typeof error === "object" && error && "code" in error && error.code === "23505") throw new Error("DUPLICATE_VOTE"); throw error; } }
  async counts(pollId: string) { const rows = await this.db.select({ optionId: votes.optionId, value: count() }).from(votes).where(and(eq(votes.pollId, pollId), eq(votes.accepted, true))).groupBy(votes.optionId); return new Map(rows.filter((row): row is typeof row & { optionId: string } => row.optionId !== null).map((row) => [row.optionId, Number(row.value)])); }
  async create(input: CreatePollRequest, creatorId: string | null) {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(polls).values({ question: input.question, topic: input.topic, status: "active", responseType: input.responseType, commentMode: input.commentMode, audienceScope: input.target.scope, targetCountryCode:input.target.countryCode??"IN", targetStateCode: input.target.stateCode, targetLokSabhaConstituencyCode: input.target.lokSabhaConstituencyCode, opensAt: new Date(input.opensAt), closesAt: new Date(input.closesAt), createdBy: creatorId, mediaKind: input.media?.kind ?? null, mediaUrl: input.media?.url ?? null, mediaOriginalName: input.media?.originalName ?? null }).returning();
      if (!created) throw new Error("POLL_CREATE_FAILED");
      const options = input.options.length ? await tx.insert(pollOptions).values(input.options.map((label, position) => ({ pollId: created.id, label, position, mediaUrl:input.optionMediaUrls[position]??null }))).returning({ id: pollOptions.id, label: pollOptions.label, position: pollOptions.position, mediaUrl:pollOptions.mediaUrl }) : [];
      return { id: created.id, question: created.question, topic: created.topic, opensAt: created.opensAt, closesAt: created.closesAt, responseType: created.responseType, commentMode: created.commentMode, media: created.mediaKind && created.mediaUrl ? {kind:created.mediaKind as "image"|"video",url:created.mediaUrl,originalName:created.mediaOriginalName}:null, target: { scope: created.audienceScope, countryCode:created.targetCountryCode??"IN", stateCode: created.targetStateCode, lokSabhaConstituencyCode: created.targetLokSabhaConstituencyCode }, options };
    });
  }
  async privateResponses(pollId: string) { return this.db.select({ optionId: votes.optionId, answer: votes.privateAnswer, comment: votes.privateComment, createdAt: votes.createdAt }).from(votes).where(and(eq(votes.pollId, pollId), eq(votes.accepted, true))); }
}
