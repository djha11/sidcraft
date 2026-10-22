import type { CreatePollRequest, Poll, PollAnalytics, VoteRequest } from "@pulse/contracts";
import { indiaRegionsSeed, lokSabhaConstituenciesSeed } from "@pulse/database/india";
import type { AudienceProfile, PollRecord, PollRepository } from "./repository.js";

export class PollError extends Error { constructor(public readonly code: "POLL_NOT_FOUND" | "POLL_CLOSED" | "DUPLICATE_VOTE" | "INVALID_OPTION" | "INVALID_RESPONSE_MODE" | "ANSWER_REQUIRED" | "COMMENT_REQUIRED" | "COMMENT_DISABLED" | "INVALID_SCHEDULE" | "INVALID_TARGET") { super(code); } }
export class PollService {
  constructor(private readonly repository: PollRepository, private readonly audienceFor: (userId: string) => Promise<AudienceProfile>) {}
  async featured(userId: string) { const poll = await this.repository.getFeatured(await this.audienceFor(userId)); if (!poll) throw new PollError("POLL_NOT_FOUND"); return this.present(poll, userId); }
  async get(id: string, userId: string) { const poll = await this.repository.getActive(id); if (!poll) throw new PollError("POLL_NOT_FOUND"); return this.present(poll, userId); }
  async vote(id: string, submission: VoteRequest, userId: string) {
    const poll = await this.repository.getActive(id); if (!poll) throw new PollError("POLL_NOT_FOUND"); if (poll.closesAt <= new Date()) throw new PollError("POLL_CLOSED");
    if (poll.responseType === "choice" && (!submission.optionId || !poll.options.some((option) => option.id === submission.optionId))) throw new PollError("INVALID_OPTION");
    if (poll.responseType === "open_text" && !submission.answer) throw new PollError("ANSWER_REQUIRED");
    if ((poll.responseType === "choice" && submission.answer) || (poll.responseType === "open_text" && submission.optionId)) throw new PollError("INVALID_RESPONSE_MODE");
    if (poll.commentMode === "required" && !submission.comment) throw new PollError("COMMENT_REQUIRED");
    if (poll.commentMode === "disabled" && submission.comment) throw new PollError("COMMENT_DISABLED");
    try { await this.repository.vote(id, userId, submission); } catch (error) { if (error instanceof Error && error.message === "DUPLICATE_VOTE") throw new PollError("DUPLICATE_VOTE"); throw error; }
    return this.present(poll, userId);
  }
  async create(input: CreatePollRequest, creatorId: string | null) { if (new Date(input.closesAt) <= new Date(input.opensAt)) throw new PollError("INVALID_SCHEDULE"); if (input.target.stateCode && !indiaRegionsSeed.some((region) => region.code === input.target.stateCode)) throw new PollError("INVALID_TARGET"); if (input.target.lokSabhaConstituencyCode && !lokSabhaConstituenciesSeed.some((item) => item.code === input.target.lokSabhaConstituencyCode && item.stateCode === input.target.stateCode)) throw new PollError("INVALID_TARGET"); return this.repository.create(input, creatorId); }
  async adminList() { const now=Date.now(); return Promise.all((await this.repository.list()).map(async poll=>{const counts=await this.repository.counts(poll.id), total=poll.responseType==="choice"?[...counts.values()].reduce((a,b)=>a+b,0):(await this.repository.privateResponses(poll.id)).length;return {id:poll.id,question:poll.question,topic:poll.topic,responseType:poll.responseType,status:poll.opensAt.getTime()>now?"scheduled":poll.closesAt.getTime()<=now?"ended":"live",opensAt:poll.opensAt.toISOString(),closesAt:poll.closesAt.toISOString(),target:poll.target,media:poll.media,responseCount:total,options:poll.options.map(option=>({...option,votes:counts.get(option.id)??0,percentage:total?Math.round(((counts.get(option.id)??0)/total)*100):0}))}})); }
  async analytics(id: string): Promise<PollAnalytics> {
    const poll = await this.repository.getById(id); if (!poll) throw new PollError("POLL_NOT_FOUND"); const responses = await this.repository.privateResponses(id);
    return { pollId: poll.id, question: poll.question, responseType: poll.responseType, responseCount: responses.length,
      anonymousAnswers: responses.filter((row) => row.answer || row.comment).map((row) => ({ answer: row.answer, comment: row.comment, submittedOn: row.createdAt.toISOString().slice(0, 10) })),
      notice: "Restricted analytics: authors, vote choices, precise locations, and exact timestamps are intentionally omitted." };
  }
  private async present(poll: PollRecord, userId: string): Promise<Poll> { const response = await this.repository.findVote(poll.id, userId); const selectedOptionId = response?.optionId ?? null; const counts = await this.repository.counts(poll.id); const total = poll.responseType === "choice" ? [...counts.values()].reduce((sum, value) => sum + value, 0) : (await this.repository.privateResponses(poll.id)).length; return { id: poll.id, question: poll.question, topic: poll.topic, closesAt: poll.closesAt.toISOString(), responseType: poll.responseType, commentMode: poll.commentMode, target: poll.target, media: poll.media, responseCount: total, viewerHasVoted: response !== null, selectedOptionId, options: poll.options.map((option) => ({ ...option, ...(response && poll.responseType === "choice" ? { percentage: total ? Math.round(((counts.get(option.id) ?? 0) / total) * 100) : 0 } : {}) })) }; }
}
