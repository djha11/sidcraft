import { randomUUID } from "node:crypto";
import type {
  AppNotification,
  CreateFeedPost,
  CreateFeedReport,
  CreateStory,
  FeedAuthor,
  FeedComment,
  FeedMedia,
  FeedPost,
  FeedReply,
  LiveComment,
  LiveSession,
  ProfileOverview,
  Publication,
  Story,
  StoryMessage,
  StoryViewer,
  UpdateProfile,
  VoteFeedPoll,
} from "@pulse/contracts";

export type StoredMedia = FeedMedia & { dataBase64: string };
const extractTerms = (value: string) =>
  (value.toLocaleLowerCase().match(/#[\p{L}\p{N}_]+|[\p{L}\p{N}_]{4,}/gu) ?? [])
    .map((term) => term.replace(/^#/, ""))
    .filter(
      (term) =>
        !["this", "that", "with", "from", "have", "your", "about"].includes(
          term,
        ),
    );
export interface FeedRepository {
  list(
    viewerId: string,
    cursor: Date | null,
    limit: number,
  ): Promise<{ items: FeedPost[]; hasMore: boolean }>;
  searchAuthors(viewerId: string, query: string): Promise<FeedAuthor[]>;
  interestTerms(viewerId: string): Promise<string[]>;
  get(postId: string, viewerId: string): Promise<FeedPost | null>;
  createPost(author: FeedAuthor, input: CreateFeedPost): Promise<string>;
  deletePost(postId: string, ownerId: string): Promise<void>;
  addLike(postId: string, userId: string): Promise<void>;
  removeLike(postId: string, userId: string): Promise<void>;
  addRepost(postId: string, userId: string): Promise<void>;
  removeRepost(postId: string, userId: string): Promise<void>;
  addComment(
    postId: string,
    author: FeedAuthor,
    body: string,
    parentCommentId?: string | null,
  ): Promise<FeedComment | FeedReply>;
  comments(postId: string, viewerId: string): Promise<FeedComment[]>;
  deleteComment(
    postId: string,
    commentId: string,
    ownerId: string,
  ): Promise<void>;
  media(mediaId: string): Promise<StoredMedia | null>;
  report(
    postId: string,
    reporterId: string,
    report: CreateFeedReport,
  ): Promise<void>;
  follow(followerId: string, followedId: string): Promise<void>;
  unfollow(followerId: string, followedId: string): Promise<void>;
  block(blockerId: string, blockedId: string): Promise<void>;
  reels(viewerId: string): Promise<Publication[]>;
  profileVideos(userId: string, viewerId: string): Promise<FeedPost[]>;
  profile(userId: string, viewerId: string): Promise<ProfileOverview | null>;
  connections(userId:string,kind:"followers"|"following"):Promise<FeedAuthor[]>;
  updateProfile(
    userId: string,
    input: UpdateProfile,
    author: FeedAuthor,
  ): Promise<void>;
  profileMedia(
    userId: string,
  ): Promise<{ mimeType: string; dataBase64: string } | null>;
  stories(viewerId: string): Promise<Story[]>;
  createStory(author: FeedAuthor, input: CreateStory): Promise<Story>;
  deleteStory(storyId: string, ownerId: string): Promise<void>;
  storyMedia(storyId: string): Promise<StoredMedia | null>;
  votePoll(postId: string, userId: string, input: VoteFeedPoll): Promise<void>;
  viewStory(storyId: string, viewer: FeedAuthor): Promise<void>;
  likeStory(storyId: string, userId: string, enabled: boolean): Promise<void>;
  replyStory(
    storyId: string,
    sender: FeedAuthor,
    body: string,
  ): Promise<StoryMessage>;
  storyViewers(storyId: string, ownerId: string): Promise<StoryViewer[]>;
  storyMessages(userId: string): Promise<StoryMessage[]>;
  liveSessions(viewerId: string): Promise<LiveSession[]>;
  startLive(host: FeedAuthor, title: string): Promise<LiveSession>;
  endLive(id: string, hostId: string): Promise<void>;
  joinLive(id: string, viewerId: string, joined: boolean): Promise<void>;
  liveComments(id: string): Promise<LiveComment[]>;
  addLiveComment(
    id: string,
    author: FeedAuthor,
    body: string,
  ): Promise<LiveComment>;
  notifications(userId: string): Promise<AppNotification[]>;
  readNotifications(userId: string, id?: string): Promise<void>;
  notifyPost(
    postId: string,
    actor: FeedAuthor,
    type: "post_like" | "post_comment" | "mention",
  ): Promise<void>;
  notifyFollow(actor: FeedAuthor, targetId: string): Promise<void>;
  notifyMentions(
    postId: string,
    actor: FeedAuthor,
    body: string,
  ): Promise<void>;
  registerPushToken(
    userId: string,
    token: string,
    platform: "android" | "ios",
  ): Promise<void>;
}

type MemoryComment = {
  id: string;
  postId: string;
  author: FeedAuthor;
  body: string;
  parentCommentId: string | null;
  createdAt: Date;
};
type MemoryPost = {
  id: string;
  author: FeedAuthor;
  body: string;
  isAnonymous: boolean;
  media: StoredMedia[];
  createdAt: Date;
};
type MemoryStory = {
  id: string;
  author: FeedAuthor;
  media: StoredMedia;
  caption: string;
  isHighlight: boolean;
  createdAt: Date;
  expiresAt: Date;
};
type MemoryPoll = {
  question: string;
  allowMultiple: boolean;
  closesAt: Date;
  options: Array<{ id: string; label: string }>;
  votes: Map<string, Set<string>>;
};
type MemoryStoryReply = {
  id: string;
  storyId: string;
  sender: FeedAuthor;
  recipient: FeedAuthor;
  body: string;
  createdAt: Date;
};
type MemoryLive = {
  id: string;
  host: FeedAuthor;
  title: string;
  status: "live" | "ended";
  startedAt: Date;
  endedAt: Date | null;
};

export class MemoryFeedRepository implements FeedRepository {
  private readonly posts: MemoryPost[] = [];
  private readonly likes = new Set<string>();
  private readonly reposts = new Set<string>();
  private readonly commentRows: MemoryComment[] = [];
  private readonly reports = new Set<string>();
  private readonly follows = new Set<string>();
  private readonly blocks = new Set<string>();
  private readonly storyRows: MemoryStory[] = [];
  private readonly polls = new Map<string, MemoryPoll>();
  private readonly storyViewRows = new Map<string, Date>();
  private readonly storyViewerAuthors = new Map<string, FeedAuthor>();
  private readonly storyLikeRows = new Set<string>();
  private readonly storyReplyRows: MemoryStoryReply[] = [];
  private readonly liveRows: MemoryLive[] = [];
  private readonly liveViewerRows = new Set<string>();
  private readonly liveCommentRows: LiveComment[] = [];
  private readonly notificationRows: AppNotification[] = [];
  private readonly pushTokens = new Map<
    string,
    { userId: string; platform: "android" | "ios" }
  >();
  private readonly profileEdits = new Map<string, UpdateProfile>();
  private readonly profileAuthors = new Map<string, FeedAuthor>();
  async connections(userId:string,kind:"followers"|"following"){const ids=[...this.follows].map(x=>x.split(":")) .filter(([a,b])=>kind==="followers"?b===userId:a===userId).map(([a,b])=>kind==="followers"?a!:b!);return ids.map(id=>this.profileAuthors.get(id)).filter((x):x is FeedAuthor=>!!x);}

  async list(viewerId: string, cursor: Date | null, limit: number) {
    const visible = this.posts
      .filter(
        (p) =>
          (!cursor || p.createdAt < cursor) &&
          !this.reports.has(`${viewerId}:${p.id}`),
      )
      .filter(
        (p) =>
          !this.blocks.has(`${viewerId}:${p.author.id}`) &&
          !this.blocks.has(`${p.author.id}:${viewerId}`),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      items: visible.slice(0, limit).map((p) => this.present(p, viewerId)),
      hasMore: visible.length > limit,
    };
  }
  async searchAuthors(viewerId: string, query: string) {
    const normalized = query.toLocaleLowerCase();
    const authors = new Map<string, FeedAuthor>();
    for (const post of this.posts) authors.set(post.author.id, post.author);
    for (const [id, author] of this.profileAuthors) authors.set(id, author);
    return [...authors.values()]
      .filter((author) => author.id !== viewerId)
      .filter(
        (author) =>
          !this.blocks.has(`${viewerId}:${author.id}`) &&
          !this.blocks.has(`${author.id}:${viewerId}`),
      )
      .filter(
        (author) =>
          author.displayName.toLocaleLowerCase().includes(normalized) ||
          author.handle.toLocaleLowerCase().includes(normalized),
      )
      .slice(0, 20);
  }
  async interestTerms(viewerId: string) {
    const engaged = new Set<string>();
    for (const key of this.likes)
      if (key.startsWith(`${viewerId}:`))
        engaged.add(key.slice(viewerId.length + 1));
    for (const key of this.reposts)
      if (key.startsWith(`${viewerId}:`))
        engaged.add(key.slice(viewerId.length + 1));
    for (const comment of this.commentRows)
      if (comment.author.id === viewerId) engaged.add(comment.postId);
    return this.posts
      .filter((post) => engaged.has(post.id))
      .flatMap((post) => extractTerms(post.body));
  }
  async get(id: string, viewerId: string) {
    const p = this.posts.find((x) => x.id === id);
    return p ? this.present(p, viewerId) : null;
  }
  async createPost(author: FeedAuthor, input: CreateFeedPost) {
    const id = randomUUID();
    const media: StoredMedia[] = input.media.map((m) => {
      const mediaId = randomUUID();
      return {
        id: mediaId,
        kind: m.kind,
        mimeType: m.mimeType,
        originalName: m.originalName,
        sizeBytes: m.sizeBytes,
        durationSeconds: m.durationSeconds ?? null,
        url: `/v1/feed/media/${mediaId}`,
        dataBase64: m.base64,
      };
    });
    this.posts.unshift({
      id,
      author,
      body: input.body,
      isAnonymous: input.anonymous,
      media,
      createdAt: new Date(),
    });
    if (input.poll)
      this.polls.set(id, {
        question: input.poll.question,
        allowMultiple: input.poll.allowMultiple,
        closesAt: new Date(Date.now() + input.poll.durationMinutes * 60_000),
        options: input.poll.options.map((label) => ({
          id: randomUUID(),
          label,
        })),
        votes: new Map(),
      });
    return id;
  }
  async deletePost(id: string, ownerId: string) {
    const index = this.posts.findIndex((post) => post.id === id);
    if (index < 0) throw new Error("POST_NOT_FOUND");
    if (this.posts[index]!.author.id !== ownerId)
      throw new Error("POST_OWNER_REQUIRED");
    this.posts.splice(index, 1);
    for (const key of [...this.likes])
      if (key.endsWith(`:${id}`)) this.likes.delete(key);
    for (const key of [...this.reposts])
      if (key.endsWith(`:${id}`)) this.reposts.delete(key);
  }
  async addLike(id: string, uid: string) {
    this.requirePost(id);
    this.likes.add(`${uid}:${id}`);
  }
  async removeLike(id: string, uid: string) {
    this.requirePost(id);
    this.likes.delete(`${uid}:${id}`);
  }
  async addRepost(id: string, uid: string) {
    this.requirePost(id);
    this.reposts.add(`${uid}:${id}`);
  }
  async removeRepost(id: string, uid: string) {
    this.requirePost(id);
    this.reposts.delete(`${uid}:${id}`);
  }
  async addComment(
    postId: string,
    author: FeedAuthor,
    body: string,
    parentCommentId?: string | null,
  ) {
    this.requirePost(postId);
    if (
      parentCommentId &&
      !this.commentRows.some(
        (c) =>
          c.id === parentCommentId && c.postId === postId && !c.parentCommentId,
      )
    )
      throw new Error("COMMENT_NOT_FOUND");
    const row = {
      id: randomUUID(),
      postId,
      author,
      body,
      parentCommentId: parentCommentId ?? null,
      createdAt: new Date(),
    };
    this.commentRows.push(row);
    return this.presentAnyComment(row, author.id) as FeedComment;
  }
  async comments(postId: string, viewerId: string) {
    this.requirePost(postId);
    return this.thread(postId, viewerId);
  }
  async deleteComment(postId: string, commentId: string, ownerId: string) {
    this.requirePost(postId);
    const comment = this.commentRows.find(
      (row) => row.id === commentId && row.postId === postId,
    );
    if (!comment) throw new Error("COMMENT_NOT_FOUND");
    if (comment.author.id !== ownerId)
      throw new Error("COMMENT_OWNER_REQUIRED");
    const childIds = new Set(
      this.commentRows
        .filter((row) => row.parentCommentId === commentId)
        .map((row) => row.id),
    );
    for (let index = this.commentRows.length - 1; index >= 0; index--)
      if (
        this.commentRows[index]!.id === commentId ||
        childIds.has(this.commentRows[index]!.id)
      )
        this.commentRows.splice(index, 1);
  }
  async media(id: string) {
    return this.posts.flatMap((p) => p.media).find((m) => m.id === id) ?? null;
  }
  async report(id: string, uid: string) {
    this.requirePost(id);
    this.reports.add(`${uid}:${id}`);
  }
  async follow(a: string, b: string) {
    this.follows.add(`${a}:${b}`);
  }
  async unfollow(a: string, b: string) {
    this.follows.delete(`${a}:${b}`);
  }
  async block(a: string, b: string) {
    this.blocks.add(`${a}:${b}`);
    this.follows.delete(`${a}:${b}`);
    this.follows.delete(`${b}:${a}`);
  }
  async reels(viewerId: string) {
    return this.posts
      .filter(
        (p) =>
          !this.reports.has(`${viewerId}:${p.id}`) &&
          !this.blocks.has(`${viewerId}:${p.author.id}`) &&
          !this.blocks.has(`${p.author.id}:${viewerId}`),
      )
      .flatMap((p) =>
        p.media
          .filter(
            (m) =>
              m.kind === "video" &&
              !!m.durationSeconds &&
              m.durationSeconds <= 180,
          )
          .map((m) => ({
            id: m.id,
            kind: "reel" as const,
            category: "entertainment" as const,
            headline: p.body || m.originalName,
            summary: p.body,
            mediaUrl: m.url,
            sourceName: `@${p.author.handle}`,
            sourceUrl: m.url,
            evidenceNote: "User-created reel",
            publishedAt: p.createdAt.toISOString(),
            author: p.author,
            feedPostId: p.id,
            isOwn: p.author.id === viewerId,
          })),
      )
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }
  async profileVideos(userId: string, viewerId: string) {
    return this.posts
      .filter(
        (p) =>
          p.author.id === userId && p.media.some((m) => m.kind === "video"),
      )
      .map((p) => this.present(p, viewerId));
  }
  async profile(
    userId: string,
    viewerId: string,
  ): Promise<ProfileOverview | null> {
    const ownRows = this.posts.filter((p) => p.author.id === userId);
    const author =
      ownRows[0]?.author ??
      this.storyRows.find((s) => s.author.id === userId)?.author ??
      this.liveRows.find((l) => l.host.id === userId)?.host ??
      this.profileAuthors.get(userId);
    if (!author) return null;
    const isOwn = userId === viewerId;
    const publicRows = ownRows.filter((p) => !p.isAnonymous);
    const reelRows = publicRows.filter((p) =>
      p.media.some(
        (m) =>
          m.kind === "video" && !!m.durationSeconds && m.durationSeconds <= 180,
      ),
    );
    const postRows = publicRows.filter((p) => !reelRows.includes(p));
    const repostIds = [...this.reposts]
      .filter((key) => key.startsWith(`${userId}:`))
      .map((key) => key.split(":")[1]!);
    const taggedRows = this.posts.filter(
      (p) =>
        p.author.id !== userId &&
        !p.isAnonymous &&
        new RegExp(`(^|\\s)@${author.handle}(?=$|[\\s.,!?])`, "i").test(p.body),
    );
    return {
      user: {
        ...author,
        displayName:
          this.profileEdits.get(userId)?.displayName ?? author.displayName,
        handle: this.profileEdits.get(userId)?.username ?? author.handle,
        bio: this.profileEdits.get(userId)?.bio ?? null,
        website: this.profileEdits.get(userId)?.website ?? null,
        avatar: this.profileEdits.get(userId)?.avatar
          ? {
              kind: this.profileEdits.get(userId)!.avatar!.kind,
              url: `/v1/feed/users/${userId}/avatar`,
              scale: this.profileEdits.get(userId)!.avatar!.scale,
              offsetX: this.profileEdits.get(userId)!.avatar!.offsetX,
              offsetY: this.profileEdits.get(userId)!.avatar!.offsetY,
            }
          : null,
      },
      isOwn,
      viewerFollows: this.follows.has(`${viewerId}:${userId}`),
      counts: {
        posts: publicRows.length,
        anonymous: isOwn ? ownRows.filter((p) => p.isAnonymous).length : null,
        followers: [...this.follows].filter((key) => key.endsWith(`:${userId}`))
          .length,
        following: [...this.follows].filter((key) =>
          key.startsWith(`${userId}:`),
        ).length,
      },
      posts: postRows.map((p) => this.present(p, viewerId)),
      reels: reelRows.map((p) => this.present(p, viewerId)),
      anonymous: isOwn
        ? ownRows
            .filter((p) => p.isAnonymous)
            .map((p) => this.present(p, viewerId))
        : [],
      reposts: this.posts
        .filter((p) => repostIds.includes(p.id))
        .map((p) => this.present(p, viewerId)),
      tagged: taggedRows.map((p) => this.present(p, viewerId)),
      highlights: this.storyRows
        .filter((story) => story.author.id === userId && story.isHighlight)
        .map((story) => this.presentStory(story, viewerId)),
    };
  }
  async updateProfile(
    userId: string,
    input: UpdateProfile,
    author: FeedAuthor,
  ) {
    if (
      [...this.profileEdits.entries()].some(
        ([id, value]) => id !== userId && value.username === input.username,
      )
    )
      throw new Error("USERNAME_TAKEN");
    this.profileEdits.set(userId, input);
    this.profileAuthors.set(userId, {
      ...author,
      displayName: input.displayName,
      handle: input.username,
    });
    for (const post of this.posts)
      if (post.author.id === userId)
        post.author = {
          ...post.author,
          displayName: input.displayName,
          handle: input.username,
        };
  }
  async profileMedia(userId: string) {
    const avatar = this.profileEdits.get(userId)?.avatar;
    return avatar
      ? { mimeType: avatar.mimeType, dataBase64: avatar.base64 }
      : null;
  }
  async stories(viewerId: string) {
    const now = Date.now();
    return this.storyRows
      .filter(
        (s) =>
          !s.isHighlight &&
          s.expiresAt.getTime() > now &&
          (s.author.id === viewerId ||
            this.follows.has(`${viewerId}:${s.author.id}`)),
      )
      .sort(
        (a, b) =>
          Number(b.author.id === viewerId) - Number(a.author.id === viewerId) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .map((s) => this.presentStory(s, viewerId));
  }
  async createStory(author: FeedAuthor, input: CreateStory) {
    const id = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 86_400_000);
    const media: StoredMedia = {
      id,
      ...input.media,
      durationSeconds: input.media.durationSeconds ?? null,
      url: `/v1/feed/stories/${id}/media`,
      dataBase64: input.media.base64,
    };
    const row = {
      id,
      author,
      media,
      caption: input.caption,
      isHighlight: input.isHighlight,
      createdAt,
      expiresAt,
    };
    this.storyRows.push(row);
    return this.presentStory(row, author.id);
  }
  async deleteStory(id: string, ownerId: string) {
    const index = this.storyRows.findIndex((story) => story.id === id);
    if (index < 0) throw new Error("STORY_NOT_FOUND");
    if (this.storyRows[index]!.author.id !== ownerId)
      throw new Error("STORY_OWNER_REQUIRED");
    this.storyRows.splice(index, 1);
  }
  async storyMedia(id: string) {
    return this.storyRows.find((s) => s.id === id)?.media ?? null;
  }
  async votePoll(postId: string, userId: string, input: VoteFeedPoll) {
    const poll = this.polls.get(postId);
    if (!poll || poll.closesAt <= new Date())
      throw new Error("POLL_NOT_AVAILABLE");
    if (!poll.allowMultiple && input.optionIds.length !== 1)
      throw new Error("MULTIPLE_CHOICES_NOT_ALLOWED");
    if (input.optionIds.some((id) => !poll.options.some((o) => o.id === id)))
      throw new Error("POLL_OPTION_NOT_FOUND");
    for (const voters of poll.votes.values()) voters.delete(userId);
    for (const id of input.optionIds) {
      const voters = poll.votes.get(id) ?? new Set<string>();
      voters.add(userId);
      poll.votes.set(id, voters);
    }
  }
  async viewStory(storyId: string, viewer: FeedAuthor) {
    this.requireStory(storyId);
    this.storyViewRows.set(`${storyId}:${viewer.id}`, new Date());
    this.storyViewerAuthors.set(viewer.id, viewer);
  }
  async likeStory(storyId: string, userId: string, enabled: boolean) {
    const story = this.requireStory(storyId);
    if (enabled) {
      this.storyLikeRows.add(`${storyId}:${userId}`);
      const sender = this.storyViewerAuthors.get(userId);
      if (
        sender &&
        !this.storyReplyRows.some(
          (r) =>
            r.storyId === storyId &&
            r.sender.id === userId &&
            r.body === "♥ Liked your story",
        )
      )
        this.storyReplyRows.push({
          id: randomUUID(),
          storyId,
          sender,
          recipient: story.author,
          body: "♥ Liked your story",
          createdAt: new Date(),
        });
    } else this.storyLikeRows.delete(`${storyId}:${userId}`);
  }
  async replyStory(storyId: string, sender: FeedAuthor, body: string) {
    const story = this.requireStory(storyId);
    const row = {
      id: randomUUID(),
      storyId,
      sender,
      recipient: story.author,
      body,
      createdAt: new Date(),
    };
    this.storyReplyRows.push(row);
    return this.presentMessage(row, sender.id);
  }
  async storyViewers(storyId: string, ownerId: string) {
    const story = this.requireStory(storyId);
    if (story.author.id !== ownerId) throw new Error("STORY_OWNER_REQUIRED");
    return [...this.storyViewRows.entries()]
      .filter(([key]) => key.startsWith(`${storyId}:`))
      .map(([key, viewedAt]) => {
        const id = key.split(":")[1]!;
        const user = this.storyViewerAuthors.get(id);
        return user
          ? {
              user,
              viewedAt: viewedAt.toISOString(),
              liked: this.storyLikeRows.has(`${storyId}:${id}`),
            }
          : null;
      })
      .filter((item): item is StoryViewer => !!item);
  }
  async storyMessages(userId: string) {
    return this.storyReplyRows
      .filter((m) => m.sender.id === userId || m.recipient.id === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((m) => this.presentMessage(m, userId));
  }
  async liveSessions(viewerId: string) {
    return this.liveRows
      .filter(
        (l) =>
          l.status === "live" &&
          (l.host.id === viewerId ||
            this.follows.has(`${viewerId}:${l.host.id}`)),
      )
      .map((l) => this.presentLive(l, viewerId));
  }
  async startLive(host: FeedAuthor, title: string) {
    for (const row of this.liveRows.filter(
      (l) => l.host.id === host.id && l.status === "live",
    )) {
      row.status = "ended";
      row.endedAt = new Date();
    }
    const row: MemoryLive = {
      id: randomUUID(),
      host,
      title,
      status: "live",
      startedAt: new Date(),
      endedAt: null,
    };
    this.liveRows.unshift(row);
    for (const key of this.follows)
      if (key.endsWith(`:${host.id}`)) {
        const recipientId = key.split(":")[0]!;
        this.notificationRows.unshift({
          id: randomUUID(),
          type: "live_started",
          actor: host,
          message: `${host.displayName} is live now`,
          postId: null,
          liveSessionId: row.id,
          readAt: null,
          createdAt: new Date().toISOString(),
          ...({ recipientId } as object),
        } as AppNotification);
      }
    return this.presentLive(row, host.id);
  }
  async endLive(id: string, hostId: string) {
    const row = this.liveRows.find((l) => l.id === id && l.host.id === hostId);
    if (!row) throw new Error("LIVE_NOT_FOUND");
    row.status = "ended";
    row.endedAt = new Date();
  }
  async joinLive(id: string, viewerId: string, joined: boolean) {
    const row = this.liveRows.find((l) => l.id === id && l.status === "live");
    if (!row) throw new Error("LIVE_NOT_FOUND");
    joined
      ? this.liveViewerRows.add(`${id}:${viewerId}`)
      : this.liveViewerRows.delete(`${id}:${viewerId}`);
  }
  async liveComments(id: string) {
    if (!this.liveRows.some((l) => l.id === id))
      throw new Error("LIVE_NOT_FOUND");
    return this.liveCommentRows.filter((c) => c.liveSessionId === id);
  }
  async addLiveComment(id: string, author: FeedAuthor, body: string) {
    if (!this.liveRows.some((l) => l.id === id && l.status === "live"))
      throw new Error("LIVE_NOT_FOUND");
    const row = {
      id: randomUUID(),
      liveSessionId: id,
      author,
      body,
      createdAt: new Date().toISOString(),
    };
    this.liveCommentRows.push(row);
    return row;
  }
  async notifications(userId: string) {
    return this.notificationRows.filter(
      (n) =>
        (n as AppNotification & { recipientId?: string }).recipientId ===
        userId,
    );
  }
  async readNotifications(userId: string, id?: string) {
    for (const n of this.notificationRows)
      if (
        (n as AppNotification & { recipientId?: string }).recipientId ===
          userId &&
        (!id || n.id === id)
      )
        n.readAt = new Date().toISOString();
  }
  async notifyPost(
    postId: string,
    actor: FeedAuthor,
    type: "post_like" | "post_comment" | "mention",
  ) {
    const post = this.requirePost(postId);
    if (post.author.id === actor.id) return;
    this.pushNotification(
      post.author.id,
      actor,
      type,
      type === "post_like"
        ? `${actor.displayName} liked your post`
        : type === "post_comment"
          ? `${actor.displayName} commented on your post`
          : `${actor.displayName} mentioned you`,
      postId,
      null,
    );
  }
  async notifyFollow(actor: FeedAuthor, targetId: string) {
    this.pushNotification(
      targetId,
      actor,
      this.follows.has(`${targetId}:${actor.id}`) ? "follow_back" : "follow",
      this.follows.has(`${targetId}:${actor.id}`)
        ? `${actor.displayName} followed you back`
        : `${actor.displayName} started following you`,
      null,
      null,
    );
  }
  async notifyMentions(postId: string, actor: FeedAuthor, body: string) {
    const handles = new Set(
      [...body.matchAll(/@([a-z0-9_]{3,30})/gi)].map((match) =>
        match[1]!.toLowerCase(),
      ),
    );
    for (const post of this.posts)
      if (
        handles.has(post.author.handle.toLowerCase()) &&
        post.author.id !== actor.id
      )
        this.pushNotification(
          post.author.id,
          actor,
          "mention",
          `${actor.displayName} mentioned you`,
          postId,
          null,
        );
  }
  async registerPushToken(
    userId: string,
    token: string,
    platform: "android" | "ios",
  ) {
    this.pushTokens.set(token, { userId, platform });
  }

  private requirePost(id: string) {
    const post = this.posts.find((p) => p.id === id);
    if (!post) throw new Error("POST_NOT_FOUND");
    return post;
  }
  private pushNotification(
    recipientId: string,
    actor: FeedAuthor,
    type: AppNotification["type"],
    message: string,
    postId: string | null,
    liveSessionId: string | null,
  ) {
    this.notificationRows.unshift({
      id: randomUUID(),
      type,
      actor,
      message,
      postId,
      liveSessionId,
      readAt: null,
      createdAt: new Date().toISOString(),
      ...({ recipientId } as object),
    } as AppNotification);
  }
  private thread(postId: string, viewerId: string) {
    return this.commentRows
      .filter((c) => c.postId === postId && !c.parentCommentId)
      .map((c) => this.presentTopComment(c, viewerId));
  }
  private presentTopComment(c: MemoryComment, viewerId: string): FeedComment {
    return {
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: c.author,
      isOwn: c.author.id === viewerId,
      parentCommentId: null,
      replies: this.commentRows
        .filter((r) => r.parentCommentId === c.id)
        .map(
          (r) =>
            this.presentAnyComment(
              r,
              viewerId,
            ) as FeedComment["replies"][number],
        ),
    };
  }
  private presentAnyComment(c: MemoryComment, viewerId: string) {
    if (!c.parentCommentId) return this.presentTopComment(c, viewerId);
    return {
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: c.author,
      isOwn: c.author.id === viewerId,
      parentCommentId: c.parentCommentId,
    };
  }
  private present(p: MemoryPost, viewerId: string): FeedPost {
    const comments = this.thread(p.id, viewerId);
    return {
      id: p.id,
      body: p.body,
      createdAt: p.createdAt.toISOString(),
      author: p.isAnonymous ? null : p.author,
      isAnonymous: p.isAnonymous,
      media: p.media.map(({ dataBase64: _data, ...m }) => m),
      likeCount: [...this.likes].filter((k) => k.endsWith(`:${p.id}`)).length,
      commentCount: this.commentRows.filter((c) => c.postId === p.id).length,
      repostCount: [...this.reposts].filter((k) => k.endsWith(`:${p.id}`))
        .length,
      viewerLiked: this.likes.has(`${viewerId}:${p.id}`),
      viewerReposted: this.reposts.has(`${viewerId}:${p.id}`),
      viewerFollowsAuthor:
        !p.isAnonymous && this.follows.has(`${viewerId}:${p.author.id}`),
      isOwn: viewerId === p.author.id,
      recentComments: comments.slice(-2),
      poll: this.presentPoll(p.id, viewerId),
    };
  }
  private presentPoll(postId: string, viewerId: string) {
    const poll = this.polls.get(postId);
    if (!poll) return null;
    const uniqueVoters = new Set(
      [...poll.votes.values()].flatMap((set) => [...set]),
    );
    const total = uniqueVoters.size;
    return {
      question: poll.question,
      allowMultiple: poll.allowMultiple,
      closesAt: poll.closesAt.toISOString(),
      isClosed: poll.closesAt <= new Date(),
      totalVotes: total,
      options: poll.options.map((o) => {
        const count = poll.votes.get(o.id)?.size ?? 0;
        return {
          id: o.id,
          label: o.label,
          voteCount: count,
          percentage: total ? Math.round((count / total) * 1000) / 10 : 0,
          viewerSelected: poll.votes.get(o.id)?.has(viewerId) ?? false,
        };
      }),
    };
  }
  private requireStory(id: string) {
    const story = this.storyRows.find((s) => s.id === id);
    if (!story || (!story.isHighlight && story.expiresAt <= new Date()))
      throw new Error("STORY_NOT_FOUND");
    return story;
  }
  private presentStory(s: MemoryStory, viewerId: string): Story {
    return {
      id: s.id,
      author: s.author,
      media: (({ dataBase64: _data, ...m }) => m)(s.media),
      caption: s.caption,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isOwn: s.author.id === viewerId,
      viewerLiked: this.storyLikeRows.has(`${s.id}:${viewerId}`),
      viewerSeen: this.storyViewRows.has(`${s.id}:${viewerId}`),
      viewerCount: [...this.storyViewRows.keys()].filter((k) =>
        k.startsWith(`${s.id}:`),
      ).length,
      replyCount: this.storyReplyRows.filter((r) => r.storyId === s.id).length,
      isHighlight: s.isHighlight,
    };
  }
  private presentMessage(m: MemoryStoryReply, userId: string): StoryMessage {
    return {
      id: m.id,
      storyId: m.storyId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      sender: m.sender,
      recipient: m.recipient,
      isOwn: m.sender.id === userId,
    };
  }
  private presentLive(l: MemoryLive, viewerId: string): LiveSession {
    return {
      id: l.id,
      host: l.host,
      title: l.title,
      status: l.status,
      startedAt: l.startedAt.toISOString(),
      endedAt: l.endedAt?.toISOString() ?? null,
      viewerCount: [...this.liveViewerRows].filter((v) =>
        v.startsWith(`${l.id}:`),
      ).length,
      isOwn: l.host.id === viewerId,
    };
  }
}
