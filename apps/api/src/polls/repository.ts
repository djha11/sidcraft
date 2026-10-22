import { randomUUID } from "node:crypto";
import type { CreatePollRequest, PollCommentMode, PollResponseType, PollTarget } from "@pulse/contracts";

export type AudienceProfile = { countryCode: string; stateCode: string | null; lokSabhaConstituencyCode: string | null };
export type PollRecord = {
  id: string; question: string; topic: string; opensAt: Date; closesAt: Date; responseType: PollResponseType;
  commentMode: PollCommentMode; target: PollTarget; options: Array<{ id: string; label: string; position: number; mediaUrl?: string|null }>;
  media: NonNullable<CreatePollRequest["media"]> | null;
};
export type VoteSubmission = { optionId?: string | undefined; answer?: string | undefined; comment?: string | undefined };
export type StoredPrivateResponse = { optionId: string | null; answer: string | null; comment: string | null; createdAt: Date };
export interface PollRepository {
  list(): Promise<PollRecord[]>;
  getActive(id: string): Promise<PollRecord | null>;
  getById(id: string): Promise<PollRecord | null>;
  getFeatured(audience: AudienceProfile): Promise<PollRecord | null>;
  findVote(pollId: string, userId: string): Promise<StoredPrivateResponse | null>;
  vote(pollId: string, userId: string, submission: VoteSubmission): Promise<void>;
  counts(pollId: string): Promise<Map<string, number>>;
  create(input: CreatePollRequest, creatorId: string | null): Promise<PollRecord>;
  privateResponses(pollId: string): Promise<StoredPrivateResponse[]>;
}

const globalPoll: PollRecord = {
  id: "11111111-1111-4111-8111-111111111111", question: "Should cities make public transport free during severe air-pollution days?", topic: "Climate · Cities",
  opensAt: new Date(Date.now() - 3_600_000), closesAt: new Date(Date.now() + 86_400_000), responseType: "choice", commentMode: "optional",
  target: { scope: "india", countryCode:"IN", stateCode: null, lokSabhaConstituencyCode: null }, media: null, options: [
    { id: "22222222-2222-4222-8222-222222222221", label: "Yes, for everyone", position: 0 },
    { id: "22222222-2222-4222-8222-222222222222", label: "Only for essential workers", position: 1 },
    { id: "22222222-2222-4222-8222-222222222223", label: "No, improve frequency instead", position: 2 },
  ],
};
const maharashtraPoll: PollRecord = {
  id: "33333333-3333-4333-8333-333333333333", question: "Which local public-service issue should Maharashtra residents be asked about next?", topic: "Maharashtra · Local",
  opensAt: new Date(Date.now() - 3_600_000), closesAt: new Date(Date.now() + 86_400_000), responseType: "open_text", commentMode: "disabled",
  target: { scope: "state", countryCode:"IN", stateCode: "MH", lokSabhaConstituencyCode: null }, media: null, options: [],
};

export class MemoryPollRepository implements PollRepository {
  readonly poll = globalPoll;
  private readonly polls: PollRecord[] = [globalPoll, maharashtraPoll];
  private votes = new Map<string, StoredPrivateResponse>();
  async list() { return [...this.polls]; }
  async getActive(id: string) { const now = new Date(); return this.polls.find((poll) => poll.id === id && poll.opensAt <= now && poll.closesAt > now) ?? null; }
  async getById(id: string) { return this.polls.find((poll) => poll.id === id) ?? null; }
  async getFeatured(audience: AudienceProfile) {
    const now = new Date(); const active = this.polls.filter((poll) => poll.opensAt <= now && poll.closesAt > now);
    return active.find((poll) => poll.target.scope === "lok_sabha" && poll.target.lokSabhaConstituencyCode === audience.lokSabhaConstituencyCode)
      ?? active.find((poll) => poll.target.scope === "state" && poll.target.stateCode === audience.stateCode)
      ?? active.find((poll) => poll.target.scope === "country" && poll.target.countryCode === audience.countryCode)
      ?? active.find((poll) => poll.target.scope === "india" && audience.countryCode === "IN")
      ?? active.find((poll) => poll.target.scope === "global") ?? null;
  }
  async findVote(pollId: string, userId: string) { return this.votes.get(`${pollId}:${userId}`) ?? null; }
  async vote(pollId: string, userId: string, submission: VoteSubmission) { const key = `${pollId}:${userId}`; if (this.votes.has(key)) throw new Error("DUPLICATE_VOTE"); this.votes.set(key, { optionId: submission.optionId ?? null, answer: submission.answer ?? null, comment: submission.comment ?? null, createdAt: new Date() }); }
  async counts(pollId: string) { const poll = this.polls.find((item) => item.id === pollId); const counts = new Map((poll?.options ?? []).map((option) => [option.id, 0])); for (const [key, vote] of this.votes) if (key.startsWith(`${pollId}:`) && vote.optionId) counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1); return counts; }
  async create(input: CreatePollRequest) { const poll: PollRecord = { ...input, media: input.media ?? null, id: randomUUID(), opensAt: new Date(input.opensAt), closesAt: new Date(input.closesAt), options: input.options.map((label, position) => ({ id: randomUUID(), label, position, mediaUrl:input.optionMediaUrls[position]??null })) }; this.polls.unshift(poll); return poll; }
  async privateResponses(pollId: string) { return [...this.votes.entries()].filter(([key]) => key.startsWith(`${pollId}:`)).map(([, response]) => response); }
}
