import type {
  CreateFeedComment,
  CreateFeedPost,
  CreateFeedReport,
  FeedAuthor,
  FeedPage,
  FeedPost,
  Publication,
  SearchResults,
  TrendingFeed,
  UserPreferences,
} from "@pulse/contracts";
import type { FeedRepository } from "./repository.js";

export class FeedError extends Error {
  constructor(
    public readonly code:
      | "POST_NOT_FOUND"
      | "USER_NOT_FOUND"
      | "SELF_RELATION_NOT_ALLOWED"
      | "INVALID_CURSOR"
      | "COMMENT_NOT_FOUND"
      | "COMMENT_OWNER_REQUIRED"
      | "POST_OWNER_REQUIRED"
      | "STORY_NOT_FOUND"
      | "STORY_OWNER_REQUIRED"
      | "COMMENTS_DISABLED"
      | "SHARING_DISABLED"
      | "STORY_REPLIES_DISABLED",
  ) {
    super(code);
  }
}

export class FeedService {
  constructor(
    private readonly repository: FeedRepository,
    private readonly authorFor: (userId: string) => Promise<FeedAuthor | null>,
    private readonly liveTokenFor?: (
      roomName: string,
      identity: string,
      canPublish: boolean,
    ) => Promise<{ serverUrl: string; token: string }>,
    private readonly preferencesFor?: (
      userId: string,
    ) => Promise<UserPreferences>,
  ) {}

  async list(
    userId: string,
    cursorValue: string | undefined,
    limit: number,
  ): Promise<FeedPage> {
    const cursor = cursorValue ? new Date(cursorValue) : null;
    if (cursor && Number.isNaN(cursor.getTime()))
      throw new FeedError("INVALID_CURSOR");
    const result = await this.repository.list(userId, cursor, limit);
    const interests = await this.repository.interestTerms(userId);
    result.items = this.rankPosts(result.items, interests);
    const oldest = result.items.reduce<FeedPost | null>(
      (current, item) =>
        !current || item.createdAt < current.createdAt ? item : current,
      null,
    );
    return {
      items: result.items,
      nextCursor: result.hasMore && oldest ? oldest.createdAt : null,
    };
  }

  async search(userId: string, queryValue: string): Promise<SearchResults> {
    const query = queryValue.trim().toLocaleLowerCase().replace(/^#/, "");
    if (query.length < 2)
      return { people: [], posts: [], reels: [], topics: [] };
    const [{ items }, people] = await Promise.all([
      this.repository.list(userId, null, 120),
      this.repository.searchAuthors(userId, query),
    ]);
    const matching = items.filter((post) =>
      `${post.body} ${post.author?.displayName ?? ""} ${post.author?.handle ?? ""}`
        .toLocaleLowerCase()
        .includes(query),
    );
    const topicCounts = new Map<
      string,
      { postCount: number; reelCount: number }
    >();
    for (const post of items)
      for (const raw of post.body.match(/#[\p{L}\p{N}_]+/gu) ?? []) {
        if (!raw.toLocaleLowerCase().includes(query)) continue;
        const key = raw.toLocaleLowerCase();
        const count = topicCounts.get(key) ?? { postCount: 0, reelCount: 0 };
        count.postCount++;
        if (post.media.some((media) => media.kind === "video"))
          count.reelCount++;
        topicCounts.set(key, count);
      }
    const interests = await this.repository.interestTerms(userId);
    const posts = this.rankPosts(matching, interests);
    return {
      people,
      posts: posts.filter(
        (post) => !post.media.some((media) => media.kind === "video"),
      ),
      reels: posts.filter((post) =>
        post.media.some((media) => media.kind === "video"),
      ),
      topics: [...topicCounts]
        .map(([tag, counts]) => ({
          tag,
          ...counts,
          score: counts.postCount + counts.reelCount * 2,
        }))
        .sort((a, b) => b.score - a.score),
    };
  }

  async trending(
    userId: string,
    kind: "all" | "posts" | "reels" = "all",
    selectedTag?: string,
  ): Promise<TrendingFeed> {
    const { items } = await this.repository.list(userId, null, 120);
    const now = Date.now();
    const hashtag = /#[\p{L}\p{N}_]+/gu;
    const scored = items.map((post) => {
      const ageHours = Math.max(
        0,
        (now - new Date(post.createdAt).getTime()) / 3_600_000,
      );
      const engagement =
        1 + post.likeCount * 3 + post.commentCount * 4 + post.repostCount * 5;
      return { post, score: engagement / Math.pow(ageHours + 2, 0.72) };
    });
    const topicMap = new Map<
      string,
      { tag: string; postCount: number; reelCount: number; score: number }
    >();
    for (const entry of scored) {
      const reel = entry.post.media.some((media) => media.kind === "video");
      const tags = new Set(entry.post.body.match(hashtag) ?? []);
      for (const rawTag of tags) {
        const key = rawTag.toLocaleLowerCase();
        const topic = topicMap.get(key) ?? {
          tag: rawTag,
          postCount: 0,
          reelCount: 0,
          score: 0,
        };
        topic.postCount += 1;
        topic.reelCount += reel ? 1 : 0;
        topic.score += entry.score;
        topicMap.set(key, topic);
      }
    }
    const normalizedTag = selectedTag?.trim().toLocaleLowerCase();
    const filtered = scored.filter(({ post }) => {
      const reel = post.media.some((media) => media.kind === "video");
      if (kind === "reels" && !reel) return false;
      if (kind === "posts" && reel) return false;
      return (
        !normalizedTag ||
        (post.body.match(hashtag) ?? []).some(
          (tag) => tag.toLocaleLowerCase() === normalizedTag,
        )
      );
    });
    return {
      topics: [...topicMap.values()].sort((a, b) => b.score - a.score),
      items: filtered.sort((a, b) => b.score - a.score).map(({ post }) => post),
    };
  }

  async create(userId: string, input: CreateFeedPost) {
    const author = await this.requireAuthor(userId);
    const id = await this.repository.createPost(author, input);
    const post = await this.repository.get(id, userId);
    if (!post) throw new FeedError("POST_NOT_FOUND");
    await this.repository.notifyMentions(id, author, input.body);
    return post;
  }
  async deletePost(postId: string, userId: string) {
    try {
      await this.repository.deletePost(postId, userId);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "POST_NOT_FOUND" ||
          error.message === "POST_OWNER_REQUIRED")
      )
        throw new FeedError(error.message);
      throw error;
    }
  }
  async like(postId: string, userId: string, enabled: boolean) {
    try {
      enabled
        ? await this.repository.addLike(postId, userId)
        : await this.repository.removeLike(postId, userId);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "POST_NOT_FOUND" ||
          error.message === "COMMENT_NOT_FOUND")
      )
        throw new FeedError(error.message);
      throw error;
    }
    const post = await this.repository.get(postId, userId);
    if (!post) throw new FeedError("POST_NOT_FOUND");
    if (enabled)
      await this.repository.notifyPost(
        postId,
        await this.requireAuthor(userId),
        "post_like",
      );
    return post;
  }
  async comment(postId: string, userId: string, input: CreateFeedComment) {
    try {
      const post = await this.repository.get(postId, userId);
      if (!post) throw new FeedError("POST_NOT_FOUND");
      if (
        post.author &&
        post.author.id !== userId &&
        this.preferencesFor &&
        !(await this.preferencesFor(post.author.id)).allowComments
      )
        throw new FeedError("COMMENTS_DISABLED");
      const author = await this.requireAuthor(userId);
      const comment = await this.repository.addComment(
        postId,
        author,
        input.body,
        input.parentCommentId,
      );
      await this.repository.notifyPost(postId, author, "post_comment");
      await this.repository.notifyMentions(postId, author, input.body);
      return comment;
    } catch (error) {
      if (error instanceof Error && error.message === "POST_NOT_FOUND")
        throw new FeedError("POST_NOT_FOUND");
      throw error;
    }
  }
  async comments(postId: string, userId: string) {
    try {
      return await this.repository.comments(postId, userId);
    } catch (error) {
      if (error instanceof Error && error.message === "POST_NOT_FOUND")
        throw new FeedError("POST_NOT_FOUND");
      throw error;
    }
  }
  async deleteComment(postId: string, commentId: string, userId: string) {
    try {
      await this.repository.deleteComment(postId, commentId, userId);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "POST_NOT_FOUND" ||
          error.message === "COMMENT_NOT_FOUND" ||
          error.message === "COMMENT_OWNER_REQUIRED")
      )
        throw new FeedError(error.message);
      throw error;
    }
  }
  async repost(postId: string, userId: string, enabled: boolean) {
    try {
      const target = await this.repository.get(postId, userId);
      if (!target) throw new FeedError("POST_NOT_FOUND");
      if (
        enabled &&
        target.author &&
        target.author.id !== userId &&
        this.preferencesFor &&
        !(await this.preferencesFor(target.author.id)).allowSharing
      )
        throw new FeedError("SHARING_DISABLED");
      enabled
        ? await this.repository.addRepost(postId, userId)
        : await this.repository.removeRepost(postId, userId);
    } catch (error) {
      if (error instanceof Error && error.message === "POST_NOT_FOUND")
        throw new FeedError("POST_NOT_FOUND");
      throw error;
    }
    const post = await this.repository.get(postId, userId);
    if (!post) throw new FeedError("POST_NOT_FOUND");
    return post;
  }
  media(mediaId: string) {
    return this.repository.media(mediaId);
  }
  async report(postId: string, userId: string, input: CreateFeedReport) {
    try {
      await this.repository.report(postId, userId, input);
    } catch (error) {
      if (error instanceof Error && error.message === "POST_NOT_FOUND")
        throw new FeedError("POST_NOT_FOUND");
      throw error;
    }
  }
  async follow(userId: string, targetId: string, enabled: boolean) {
    if (userId === targetId) throw new FeedError("SELF_RELATION_NOT_ALLOWED");
    await this.requireAuthor(targetId);
    enabled
      ? await this.repository.follow(userId, targetId)
      : await this.repository.unfollow(userId, targetId);
    if (enabled)
      await this.repository.notifyFollow(
        await this.requireAuthor(userId),
        targetId,
      );
  }
  async block(userId: string, targetId: string) {
    if (userId === targetId) throw new FeedError("SELF_RELATION_NOT_ALLOWED");
    await this.requireAuthor(targetId);
    await this.repository.block(userId, targetId);
  }
  async reels(userId: string) {
    const [items, interests] = await Promise.all([
      this.repository.reels(userId),
      this.repository.interestTerms(userId),
    ]);
    const interestSet = new Set(interests);
    return items.sort(
      (a, b) => this.reelScore(b, interestSet) - this.reelScore(a, interestSet),
    );
  }

  private rankPosts(items: FeedPost[], interests: string[]) {
    const interestSet = new Set(interests);
    return [...items].sort(
      (a, b) => this.postScore(b, interestSet) - this.postScore(a, interestSet),
    );
  }

  private postScore(post: FeedPost, interests: Set<string>) {
    const ageHours = Math.max(
      0,
      (Date.now() - new Date(post.createdAt).getTime()) / 3_600_000,
    );
    const terms = this.terms(post.body);
    const affinity = terms.reduce(
      (sum, term) => sum + (interests.has(term) ? 7 : 0),
      0,
    );
    const social = post.viewerFollowsAuthor ? 18 : 0;
    const quality = Math.log1p(
      post.likeCount * 2 + post.commentCount * 4 + post.repostCount * 5,
    );
    const freshness = 24 / Math.pow(ageHours + 2, 0.65);
    const ownPenalty = post.isOwn ? -4 : 0;
    return affinity + social + quality + freshness + ownPenalty;
  }

  private reelScore(reel: Publication, interests: Set<string>) {
    const affinity = this.terms(`${reel.headline} ${reel.summary}`).reduce(
      (sum, term) => sum + (interests.has(term) ? 7 : 0),
      0,
    );
    const ageHours = Math.max(
      0,
      (Date.now() - new Date(reel.publishedAt).getTime()) / 3_600_000,
    );
    return affinity + 24 / Math.pow(ageHours + 2, 0.65) + (reel.isOwn ? -4 : 0);
  }

  private terms(value: string) {
    return (
      value.toLocaleLowerCase().match(/#[\p{L}\p{N}_]+|[\p{L}\p{N}_]{4,}/gu) ??
      []
    ).map((term) => term.replace(/^#/, ""));
  }
  profileVideos(userId: string, viewerId: string) {
    return this.repository.profileVideos(userId, viewerId);
  }
  async profile(userId: string, viewerId: string) {
    const profile = await this.repository.profile(userId, viewerId);
    if (!profile) throw new FeedError("USER_NOT_FOUND");
    return profile;
  }
  connections(userId: string, kind: "followers" | "following") {
    return this.repository.connections(userId, kind);
  }
  async updateProfile(
    userId: string,
    input: import("@pulse/contracts").UpdateProfile,
  ) {
    try {
      await this.repository.updateProfile(
        userId,
        input,
        await this.requireAuthor(userId),
      );
      return this.profile(userId, userId);
    } catch (error) {
      if (error instanceof Error && error.message === "USERNAME_TAKEN")
        throw new Error("USERNAME_TAKEN");
      throw error;
    }
  }
  profileMedia(userId: string) {
    return this.repository.profileMedia(userId);
  }
  stories(userId: string) {
    return this.repository.stories(userId);
  }
  async createStory(
    userId: string,
    input: import("@pulse/contracts").CreateStory,
  ) {
    return this.repository.createStory(await this.requireAuthor(userId), input);
  }
  async deleteStory(storyId: string, userId: string) {
    try {
      await this.repository.deleteStory(storyId, userId);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "STORY_NOT_FOUND" ||
          error.message === "STORY_OWNER_REQUIRED")
      )
        throw new FeedError(error.message);
      throw error;
    }
  }
  storyMedia(id: string) {
    return this.repository.storyMedia(id);
  }
  async votePoll(
    postId: string,
    userId: string,
    input: import("@pulse/contracts").VoteFeedPoll,
  ) {
    await this.repository.votePoll(postId, userId, input);
    const post = await this.repository.get(postId, userId);
    if (!post) throw new FeedError("POST_NOT_FOUND");
    return post;
  }
  async viewStory(storyId: string, userId: string) {
    await this.repository.viewStory(storyId, await this.requireAuthor(userId));
  }
  likeStory(storyId: string, userId: string, enabled: boolean) {
    return this.repository.likeStory(storyId, userId, enabled);
  }
  async replyStory(storyId: string, userId: string, body: string) {
    const story = (await this.repository.stories(userId)).find(
      (item) => item.id === storyId,
    );
    if (
      story &&
      story.author.id !== userId &&
      this.preferencesFor &&
      !(await this.preferencesFor(story.author.id)).allowStoryReplies
    )
      throw new FeedError("STORY_REPLIES_DISABLED");
    return this.repository.replyStory(
      storyId,
      await this.requireAuthor(userId),
      body,
    );
  }
  storyViewers(storyId: string, userId: string) {
    return this.repository.storyViewers(storyId, userId);
  }
  storyMessages(userId: string) {
    return this.repository.storyMessages(userId);
  }
  liveSessions(userId: string) {
    return this.repository.liveSessions(userId);
  }
  async startLive(userId: string, title: string) {
    return this.repository.startLive(await this.requireAuthor(userId), title);
  }
  endLive(id: string, userId: string) {
    return this.repository.endLive(id, userId);
  }
  joinLive(id: string, userId: string, joined: boolean) {
    return this.repository.joinLive(id, userId, joined);
  }
  liveComments(id: string) {
    return this.repository.liveComments(id);
  }
  async addLiveComment(id: string, userId: string, body: string) {
    return this.repository.addLiveComment(
      id,
      await this.requireAuthor(userId),
      body,
    );
  }
  notifications(userId: string) {
    return this.repository.notifications(userId);
  }
  readNotifications(userId: string, id?: string) {
    return this.repository.readNotifications(userId, id);
  }
  async liveCredentials(id: string, userId: string) {
    const live = (await this.repository.liveSessions(userId)).find(
      (item) => item.id === id,
    );
    if (!live || !this.liveTokenFor) throw new Error("LIVE_NOT_AVAILABLE");
    const roomName = `pulse-live-${id}`;
    return {
      ...(await this.liveTokenFor(roomName, userId, live.isOwn)),
      roomName,
    };
  }
  registerPushToken(
    userId: string,
    token: string,
    platform: "android" | "ios",
  ) {
    return this.repository.registerPushToken(userId, token, platform);
  }
  private async requireAuthor(userId: string) {
    const author = await this.authorFor(userId);
    if (!author) throw new FeedError("USER_NOT_FOUND");
    return author;
  }
}
