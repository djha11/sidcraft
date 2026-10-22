import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
} from "drizzle-orm";
import {
  feedPostComments,
  feedPostLikes,
  feedPostMedia,
  feedPostPollOptions,
  feedPostPolls,
  feedPostPollVotes,
  feedPostReposts,
  feedPostReports,
  feedPosts,
  devicePushTokens,
  follows,
  liveComments,
  liveSessions,
  liveViewers,
  notifications,
  profiles,
  stories,
  storyLikes,
  storyReplies,
  storyViews,
  userBlocks,
  type Database,
} from "@pulse/database";
import type {
  CreateFeedReport,
  FeedAuthor,
  FeedComment,
  FeedPost,
  FeedReply,
  LiveComment,
  LiveSession,
  ProfileOverview,
} from "@pulse/contracts";
import type { FeedRepository } from "./repository.js";

export class DrizzleFeedRepository implements FeedRepository {
  constructor(private readonly db: Database) {}

  async list(viewerId: string, cursor: Date | null, limit: number) {
    const [blockedRows, reportedRows] = await Promise.all([
      this.db
        .select()
        .from(userBlocks)
        .where(
          or(
            eq(userBlocks.blockerId, viewerId),
            eq(userBlocks.blockedId, viewerId),
          ),
        ),
      this.db
        .select({ postId: feedPostReports.postId })
        .from(feedPostReports)
        .where(eq(feedPostReports.reporterId, viewerId)),
    ]);
    const blocked = new Set(
      blockedRows.map((row) =>
        row.blockerId === viewerId ? row.blockedId : row.blockerId,
      ),
    );
    const reported = new Set(reportedRows.map((row) => row.postId));
    const rows = await this.db
      .select()
      .from(feedPosts)
      .where(
        and(
          eq(feedPosts.status, "active"),
          cursor ? lt(feedPosts.createdAt, cursor) : undefined,
        ),
      )
      .orderBy(desc(feedPosts.createdAt))
      .limit(Math.max(limit * 4, 40));
    const visible = rows
      .filter((row) => !blocked.has(row.authorId) && !reported.has(row.id))
      .slice(0, limit + 1);
    const items = await Promise.all(
      visible.slice(0, limit).map((row) => this.present(row, viewerId)),
    );
    return {
      items,
      hasMore:
        visible.length > limit || rows.length === Math.max(limit * 4, 40),
    };
  }

  async searchAuthors(viewerId: string, query: string) {
    const blockedRows = await this.db
      .select()
      .from(userBlocks)
      .where(
        or(
          eq(userBlocks.blockerId, viewerId),
          eq(userBlocks.blockedId, viewerId),
        ),
      );
    const blocked = new Set(
      blockedRows.map((row) =>
        row.blockerId === viewerId ? row.blockedId : row.blockerId,
      ),
    );
    const rows = await this.db
      .select({
        id: profiles.userId,
        displayName: profiles.displayName,
        handle: profiles.handle,
        verificationType: profiles.verificationType,
      })
      .from(profiles)
      .where(
        or(
          ilike(profiles.displayName, `%${query}%`),
          ilike(profiles.handle, `%${query}%`),
        ),
      )
      .limit(30);
    return rows
      .filter((row) => row.id !== viewerId && !blocked.has(row.id))
      .slice(0, 20)
      .map((row) => ({
        ...row,
        verificationType:
          row.verificationType as FeedAuthor["verificationType"],
      }));
  }

  async interestTerms(viewerId: string) {
    const rows = await this.db
      .selectDistinct({ body: feedPosts.body })
      .from(feedPosts)
      .leftJoin(
        feedPostLikes,
        and(
          eq(feedPostLikes.postId, feedPosts.id),
          eq(feedPostLikes.userId, viewerId),
        ),
      )
      .leftJoin(
        feedPostReposts,
        and(
          eq(feedPostReposts.postId, feedPosts.id),
          eq(feedPostReposts.userId, viewerId),
        ),
      )
      .leftJoin(
        feedPostComments,
        and(
          eq(feedPostComments.postId, feedPosts.id),
          eq(feedPostComments.authorId, viewerId),
        ),
      )
      .where(
        or(
          eq(feedPostLikes.userId, viewerId),
          eq(feedPostReposts.userId, viewerId),
          eq(feedPostComments.authorId, viewerId),
        ),
      )
      .limit(100);
    return rows.flatMap((row) =>
      (
        row.body
          .toLocaleLowerCase()
          .match(/#[\p{L}\p{N}_]+|[\p{L}\p{N}_]{4,}/gu) ?? []
      )
        .map((term) => term.replace(/^#/, ""))
        .filter(
          (term) =>
            !["this", "that", "with", "from", "have", "your", "about"].includes(
              term,
            ),
        ),
    );
  }

  async get(postId: string, viewerId: string) {
    const [post] = await this.db
      .select()
      .from(feedPosts)
      .where(and(eq(feedPosts.id, postId), eq(feedPosts.status, "active")))
      .limit(1);
    if (!post) return null;
    const [blocked, reported] = await Promise.all([
      this.db
        .select({ blockerId: userBlocks.blockerId })
        .from(userBlocks)
        .where(
          or(
            and(
              eq(userBlocks.blockerId, viewerId),
              eq(userBlocks.blockedId, post.authorId),
            ),
            and(
              eq(userBlocks.blockerId, post.authorId),
              eq(userBlocks.blockedId, viewerId),
            ),
          ),
        )
        .limit(1),
      this.db
        .select({ id: feedPostReports.id })
        .from(feedPostReports)
        .where(
          and(
            eq(feedPostReports.postId, postId),
            eq(feedPostReports.reporterId, viewerId),
          ),
        )
        .limit(1),
    ]);
    return blocked.length || reported.length
      ? null
      : this.present(post, viewerId);
  }

  async createPost(
    author: FeedAuthor,
    input: import("@pulse/contracts").CreateFeedPost,
  ) {
    const [post] = await this.db
      .insert(feedPosts)
      .values({
        authorId: author.id,
        body: input.body,
        isAnonymous: input.anonymous,
      })
      .returning({ id: feedPosts.id });
    if (!post) throw new Error("POST_CREATE_FAILED");
    if (input.media.length)
      await this.db.insert(feedPostMedia).values(
        input.media.map((m) => ({
          postId: post.id,
          kind: m.kind,
          mimeType: m.mimeType,
          originalName: m.originalName,
          sizeBytes: m.sizeBytes,
          dataBase64: m.base64,
          durationSeconds: m.durationSeconds ?? null,
        })),
      );
    if (input.poll) {
      await this.db.insert(feedPostPolls).values({
        postId: post.id,
        question: input.poll.question,
        allowMultiple: input.poll.allowMultiple,
        closesAt: new Date(Date.now() + input.poll.durationMinutes * 60_000),
      });
      await this.db.insert(feedPostPollOptions).values(
        input.poll.options.map((label, position) => ({
          postId: post.id,
          label,
          position,
        })),
      );
    }
    return post.id;
  }
  async deletePost(postId: string, ownerId: string) {
    const rows = await this.db
      .update(feedPosts)
      .set({ status: "removed", updatedAt: new Date() })
      .where(
        and(
          eq(feedPosts.id, postId),
          eq(feedPosts.authorId, ownerId),
          eq(feedPosts.status, "active"),
        ),
      )
      .returning({ id: feedPosts.id });
    if (!rows.length) {
      const [post] = await this.db
        .select({ id: feedPosts.id })
        .from(feedPosts)
        .where(eq(feedPosts.id, postId))
        .limit(1);
      throw new Error(post ? "POST_OWNER_REQUIRED" : "POST_NOT_FOUND");
    }
  }
  async addLike(postId: string, userId: string) {
    await this.requirePost(postId);
    await this.db
      .insert(feedPostLikes)
      .values({ postId, userId })
      .onConflictDoNothing();
  }
  async removeLike(postId: string, userId: string) {
    await this.requirePost(postId);
    await this.db
      .delete(feedPostLikes)
      .where(
        and(eq(feedPostLikes.postId, postId), eq(feedPostLikes.userId, userId)),
      );
  }
  async addRepost(postId: string, userId: string) {
    await this.requirePost(postId);
    await this.db
      .insert(feedPostReposts)
      .values({ postId, userId })
      .onConflictDoNothing();
  }
  async removeRepost(postId: string, userId: string) {
    await this.requirePost(postId);
    await this.db
      .delete(feedPostReposts)
      .where(
        and(
          eq(feedPostReposts.postId, postId),
          eq(feedPostReposts.userId, userId),
        ),
      );
  }
  async addComment(
    postId: string,
    author: FeedAuthor,
    body: string,
    parentCommentId?: string | null,
  ): Promise<FeedComment | FeedReply> {
    await this.requirePost(postId);
    if (parentCommentId) {
      const [parent] = await this.db
        .select({ id: feedPostComments.id })
        .from(feedPostComments)
        .where(
          and(
            eq(feedPostComments.id, parentCommentId),
            eq(feedPostComments.postId, postId),
          ),
        )
        .limit(1);
      if (!parent) throw new Error("COMMENT_NOT_FOUND");
    }
    const [comment] = await this.db
      .insert(feedPostComments)
      .values({
        postId,
        authorId: author.id,
        body,
        parentCommentId: parentCommentId ?? null,
      })
      .returning();
    if (!comment) throw new Error("COMMENT_CREATE_FAILED");
    if (parentCommentId)
      return {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author,
        isOwn: true,
        parentCommentId,
      };
    return {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      author,
      isOwn: true,
      parentCommentId: null,
      replies: [],
    };
  }
  async comments(postId: string, viewerId: string) {
    await this.requirePost(postId);
    return this.loadComments(postId, viewerId);
  }
  async deleteComment(postId: string, commentId: string, ownerId: string) {
    await this.requirePost(postId);
    const rows = await this.db
      .delete(feedPostComments)
      .where(
        and(
          eq(feedPostComments.id, commentId),
          eq(feedPostComments.postId, postId),
          eq(feedPostComments.authorId, ownerId),
        ),
      )
      .returning({ id: feedPostComments.id });
    if (!rows.length) {
      const [comment] = await this.db
        .select({ id: feedPostComments.id })
        .from(feedPostComments)
        .where(
          and(
            eq(feedPostComments.id, commentId),
            eq(feedPostComments.postId, postId),
          ),
        )
        .limit(1);
      throw new Error(comment ? "COMMENT_OWNER_REQUIRED" : "COMMENT_NOT_FOUND");
    }
  }
  async media(mediaId: string) {
    const [row] = await this.db
      .select()
      .from(feedPostMedia)
      .where(eq(feedPostMedia.id, mediaId))
      .limit(1);
    return row
      ? {
          id: row.id,
          kind: row.kind,
          mimeType: row.mimeType,
          originalName: row.originalName,
          sizeBytes: row.sizeBytes,
          durationSeconds: row.durationSeconds,
          url: `/v1/feed/media/${row.id}`,
          dataBase64: row.dataBase64,
        }
      : null;
  }
  async report(postId: string, reporterId: string, report: CreateFeedReport) {
    await this.requirePost(postId);
    await this.db
      .insert(feedPostReports)
      .values({
        postId,
        reporterId,
        reason: report.reason,
        note: report.note ?? null,
      })
      .onConflictDoNothing();
  }
  async follow(followerId: string, followedId: string) {
    await this.db
      .insert(follows)
      .values({ followerId, followedId })
      .onConflictDoNothing();
  }
  async unfollow(followerId: string, followedId: string) {
    await this.db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followedId, followedId),
        ),
      );
  }
  async block(blockerId: string, blockedId: string) {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(userBlocks)
        .values({ blockerId, blockedId })
        .onConflictDoNothing();
      await tx
        .delete(follows)
        .where(
          or(
            and(
              eq(follows.followerId, blockerId),
              eq(follows.followedId, blockedId),
            ),
            and(
              eq(follows.followerId, blockedId),
              eq(follows.followedId, blockerId),
            ),
          ),
        );
    });
  }
  async reels(viewerId: string) {
    const [blockedRows, reportedRows] = await Promise.all([
      this.db
        .select()
        .from(userBlocks)
        .where(
          or(
            eq(userBlocks.blockerId, viewerId),
            eq(userBlocks.blockedId, viewerId),
          ),
        ),
      this.db
        .select({ postId: feedPostReports.postId })
        .from(feedPostReports)
        .where(eq(feedPostReports.reporterId, viewerId)),
    ]);
    const blocked = new Set(
      blockedRows.map((row) =>
        row.blockerId === viewerId ? row.blockedId : row.blockerId,
      ),
    );
    const reported = new Set(reportedRows.map((row) => row.postId));
    const rows = await this.db
      .select({
        mediaId: feedPostMedia.id,
        postId: feedPosts.id,
        body: feedPosts.body,
        createdAt: feedPosts.createdAt,
        durationSeconds: feedPostMedia.durationSeconds,
        authorId: profiles.userId,
        displayName: profiles.displayName,
        handle: profiles.handle,
        verificationType: profiles.verificationType,
      })
      .from(feedPostMedia)
      .innerJoin(feedPosts, eq(feedPosts.id, feedPostMedia.postId))
      .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
      .where(
        and(eq(feedPostMedia.kind, "video"), eq(feedPosts.status, "active")),
      )
      .orderBy(desc(feedPosts.createdAt));
    return rows
      .filter(
        (r) =>
          !!r.durationSeconds &&
          r.durationSeconds <= 180 &&
          !blocked.has(r.authorId) &&
          !reported.has(r.postId),
      )
      .map((r) => ({
        id: r.mediaId,
        kind: "reel" as const,
        category: "entertainment" as const,
        headline: r.body || "User reel",
        summary: r.body,
        mediaUrl: `/v1/feed/media/${r.mediaId}`,
        sourceName: `@${r.handle}`,
        sourceUrl: `/v1/feed/media/${r.mediaId}`,
        evidenceNote: "User-created reel",
        publishedAt: r.createdAt.toISOString(),
        author: {
          id: r.authorId,
          displayName: r.displayName,
          handle: r.handle,
          verificationType:
            r.verificationType as FeedAuthor["verificationType"],
        },
        feedPostId: r.postId,
        isOwn: r.authorId === viewerId,
      }));
  }
  async profileVideos(userId: string, viewerId: string) {
    const rows = await this.db
      .selectDistinct({ id: feedPosts.id })
      .from(feedPosts)
      .innerJoin(feedPostMedia, eq(feedPostMedia.postId, feedPosts.id))
      .where(
        and(
          eq(feedPosts.authorId, userId),
          eq(feedPosts.status, "active"),
          eq(feedPostMedia.kind, "video"),
        ),
      )
      .orderBy(desc(feedPosts.createdAt));
    return Promise.all(
      rows.map(async (r) => (await this.get(r.id, viewerId))!),
    );
  }
  async profile(
    userId: string,
    viewerId: string,
  ): Promise<ProfileOverview | null> {
    const [user] = await this.db
      .select({
        id: profiles.userId,
        displayName: profiles.displayName,
        handle: profiles.handle,
        bio: profiles.bio,
        website: profiles.website,
        avatarKind: profiles.avatarKind,
        avatarScale: profiles.avatarScale,
        avatarOffsetX: profiles.avatarOffsetX,
        avatarOffsetY: profiles.avatarOffsetY,
        verificationType: profiles.verificationType,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    if (!user) return null;
    const isOwn = userId === viewerId;
    const [
      ownRows,
      followerTotal,
      followingTotal,
      viewerFollow,
      repostRows,
      taggedRows,
      highlightRows,
    ] = await Promise.all([
      this.db
        .select({ id: feedPosts.id, anonymous: feedPosts.isAnonymous })
        .from(feedPosts)
        .where(
          and(eq(feedPosts.authorId, userId), eq(feedPosts.status, "active")),
        )
        .orderBy(desc(feedPosts.createdAt)),
      this.db
        .select({ value: count() })
        .from(follows)
        .where(eq(follows.followedId, userId)),
      this.db
        .select({ value: count() })
        .from(follows)
        .where(eq(follows.followerId, userId)),
      this.db
        .select({ id: follows.followerId })
        .from(follows)
        .where(
          and(eq(follows.followerId, viewerId), eq(follows.followedId, userId)),
        )
        .limit(1),
      this.db
        .select({ id: feedPostReposts.postId })
        .from(feedPostReposts)
        .where(eq(feedPostReposts.userId, userId))
        .orderBy(desc(feedPostReposts.createdAt)),
      this.db
        .select({ id: feedPosts.id })
        .from(feedPosts)
        .where(
          and(
            ne(feedPosts.authorId, userId),
            eq(feedPosts.isAnonymous, false),
            eq(feedPosts.status, "active"),
            ilike(feedPosts.body, `%@${user.handle}%`),
          ),
        )
        .orderBy(desc(feedPosts.createdAt)),
      this.db
        .select()
        .from(stories)
        .where(and(eq(stories.authorId, userId), eq(stories.isHighlight, true)))
        .orderBy(desc(stories.createdAt)),
    ]);
    const presented = await Promise.all(
      ownRows.map(async (row) => ({
        row,
        post: (await this.get(row.id, viewerId))!,
      })),
    );
    const publicItems = presented.filter(({ row }) => !row.anonymous);
    const reels = publicItems.filter(({ post }) =>
      post.media.some(
        (media) =>
          media.kind === "video" &&
          !!media.durationSeconds &&
          media.durationSeconds <= 180,
      ),
    );
    const reelIds = new Set(reels.map(({ post }) => post.id));
    const [reposts, tagged] = await Promise.all([
      Promise.all(
        repostRows.map(async (row) => this.get(row.id, viewerId)),
      ).then((items) =>
        items.filter((item): item is FeedPost => !!item && !item.isAnonymous),
      ),
      Promise.all(
        taggedRows.map(async (row) => this.get(row.id, viewerId)),
      ).then((items) => items.filter((item): item is FeedPost => !!item)),
    ]);
    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        handle: user.handle,
        verificationType: user.verificationType as
          "general" | "grey" | "government" | "media" | "business" | null,
        bio: user.bio,
        website: user.website,
        avatar: user.avatarKind
          ? {
              kind: user.avatarKind as "image" | "video",
              url: `/v1/feed/users/${userId}/avatar`,
              scale: user.avatarScale / 1000,
              offsetX: user.avatarOffsetX / 1000,
              offsetY: user.avatarOffsetY / 1000,
            }
          : null,
      },
      isOwn,
      viewerFollows: viewerFollow.length > 0,
      counts: {
        posts: publicItems.length,
        anonymous: isOwn
          ? presented.filter(({ row }) => row.anonymous).length
          : null,
        followers: Number(followerTotal[0]?.value ?? 0),
        following: Number(followingTotal[0]?.value ?? 0),
      },
      posts: publicItems
        .filter(({ post }) => !reelIds.has(post.id))
        .map(({ post }) => post),
      reels: reels.map(({ post }) => post),
      anonymous: isOwn
        ? presented.filter(({ row }) => row.anonymous).map(({ post }) => post)
        : [],
      reposts,
      tagged,
      highlights: await Promise.all(
        highlightRows.map((story) =>
          this.presentStoryRow(
            story,
            {
              id: user.id,
              displayName: user.displayName,
              handle: user.handle,
              verificationType: user.verificationType as
                "general" | "grey" | "government" | "media" | "business" | null,
            },
            viewerId,
          ),
        ),
      ),
    };
  }
  async connections(userId: string, kind: "followers" | "following") {
    const rows = await this.db
      .select({
        id: profiles.userId,
        displayName: profiles.displayName,
        handle: profiles.handle,
        verificationType: profiles.verificationType,
      })
      .from(follows)
      .innerJoin(
        profiles,
        eq(
          profiles.userId,
          kind === "followers" ? follows.followerId : follows.followedId,
        ),
      )
      .where(
        eq(
          kind === "followers" ? follows.followedId : follows.followerId,
          userId,
        ),
      )
      .orderBy(profiles.displayName);
    return rows.map((r) => ({
      ...r,
      verificationType: r.verificationType as FeedAuthor["verificationType"],
    }));
  }
  async updateProfile(
    userId: string,
    input: import("@pulse/contracts").UpdateProfile,
    _author: import("@pulse/contracts").FeedAuthor,
  ) {
    try {
      await this.db
        .update(profiles)
        .set({
          displayName: input.displayName,
          handle: input.username,
          bio: input.bio,
          website: input.website,
          ...(input.avatar
            ? {
                avatarKind: input.avatar.kind,
                avatarMimeType: input.avatar.mimeType,
                avatarDataBase64: input.avatar.base64,
                avatarScale: Math.round(input.avatar.scale * 1000),
                avatarOffsetX: Math.round(input.avatar.offsetX * 1000),
                avatarOffsetY: Math.round(input.avatar.offsetY * 1000),
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, userId));
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "23505"
      )
        throw new Error("USERNAME_TAKEN");
      throw error;
    }
  }
  async profileMedia(userId: string) {
    const [row] = await this.db
      .select({
        mimeType: profiles.avatarMimeType,
        dataBase64: profiles.avatarDataBase64,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    return row?.mimeType && row.dataBase64
      ? { mimeType: row.mimeType, dataBase64: row.dataBase64 }
      : null;
  }
  async stories(viewerId: string) {
    const followed = await this.db
      .select({ id: follows.followedId })
      .from(follows)
      .where(eq(follows.followerId, viewerId));
    const allowed = new Set([viewerId, ...followed.map((f) => f.id)]);
    const rows = await this.db
      .select({
        story: stories,
        authorId: profiles.userId,
        displayName: profiles.displayName,
        handle: profiles.handle,
        verificationType: profiles.verificationType,
      })
      .from(stories)
      .innerJoin(profiles, eq(profiles.userId, stories.authorId))
      .orderBy(desc(stories.createdAt));
    return Promise.all(
      rows
        .filter(
          (r) =>
            !r.story.isHighlight &&
            r.story.expiresAt > new Date() &&
            allowed.has(r.authorId),
        )
        .sort(
          (a, b) =>
            Number(b.authorId === viewerId) - Number(a.authorId === viewerId),
        )
        .map((r) =>
          this.presentStoryRow(
            r.story,
            {
              id: r.authorId,
              displayName: r.displayName,
              handle: r.handle,
              verificationType:
                r.verificationType as FeedAuthor["verificationType"],
            },
            viewerId,
          ),
        ),
    );
  }
  async createStory(
    author: FeedAuthor,
    input: import("@pulse/contracts").CreateStory,
  ) {
    const expiresAt = new Date(Date.now() + 86_400_000);
    const [row] = await this.db
      .insert(stories)
      .values({
        authorId: author.id,
        kind: input.media.kind,
        mimeType: input.media.mimeType,
        originalName: input.media.originalName,
        sizeBytes: input.media.sizeBytes,
        dataBase64: input.media.base64,
        durationSeconds: input.media.durationSeconds ?? null,
        caption: input.caption,
        isHighlight: input.isHighlight,
        expiresAt,
      })
      .returning();
    if (!row) throw new Error("STORY_CREATE_FAILED");
    return {
      id: row.id,
      author,
      media: {
        id: row.id,
        kind: row.kind,
        mimeType: row.mimeType,
        originalName: row.originalName,
        sizeBytes: row.sizeBytes,
        durationSeconds: row.durationSeconds,
        url: `/v1/feed/stories/${row.id}/media`,
      },
      caption: row.caption,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      isOwn: true,
      viewerLiked: false,
      viewerSeen: false,
      viewerCount: 0,
      replyCount: 0,
      isHighlight: row.isHighlight,
    };
  }
  async deleteStory(storyId: string, ownerId: string) {
    const rows = await this.db
      .delete(stories)
      .where(and(eq(stories.id, storyId), eq(stories.authorId, ownerId)))
      .returning({ id: stories.id });
    if (!rows.length) {
      const [story] = await this.db
        .select({ id: stories.id })
        .from(stories)
        .where(eq(stories.id, storyId))
        .limit(1);
      throw new Error(story ? "STORY_OWNER_REQUIRED" : "STORY_NOT_FOUND");
    }
  }
  async storyMedia(id: string) {
    const [row] = await this.db
      .select()
      .from(stories)
      .where(eq(stories.id, id))
      .limit(1);
    return row
      ? {
          id: row.id,
          kind: row.kind,
          mimeType: row.mimeType,
          originalName: row.originalName,
          sizeBytes: row.sizeBytes,
          durationSeconds: row.durationSeconds,
          url: `/v1/feed/stories/${row.id}/media`,
          dataBase64: row.dataBase64,
        }
      : null;
  }
  private async presentStoryRow(
    story: typeof stories.$inferSelect,
    author: FeedAuthor,
    viewerId: string,
  ) {
    const [views, replies, liked, seen] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(storyViews)
        .where(eq(storyViews.storyId, story.id)),
      this.db
        .select({ value: count() })
        .from(storyReplies)
        .where(eq(storyReplies.storyId, story.id)),
      this.db
        .select({ id: storyLikes.userId })
        .from(storyLikes)
        .where(
          and(
            eq(storyLikes.storyId, story.id),
            eq(storyLikes.userId, viewerId),
          ),
        )
        .limit(1),
      this.db
        .select({ id: storyViews.viewerId })
        .from(storyViews)
        .where(
          and(
            eq(storyViews.storyId, story.id),
            eq(storyViews.viewerId, viewerId),
          ),
        )
        .limit(1),
    ]);
    return {
      id: story.id,
      author,
      media: {
        id: story.id,
        kind: story.kind,
        mimeType: story.mimeType,
        originalName: story.originalName,
        sizeBytes: story.sizeBytes,
        durationSeconds: story.durationSeconds,
        url: `/v1/feed/stories/${story.id}/media`,
      },
      caption: story.caption,
      createdAt: story.createdAt.toISOString(),
      expiresAt: story.expiresAt.toISOString(),
      isOwn: story.authorId === viewerId,
      viewerLiked: liked.length > 0,
      viewerSeen: seen.length > 0,
      viewerCount: Number(views[0]?.value ?? 0),
      replyCount: Number(replies[0]?.value ?? 0),
      isHighlight: story.isHighlight,
    };
  }
  async votePoll(
    postId: string,
    userId: string,
    input: import("@pulse/contracts").VoteFeedPoll,
  ) {
    const [poll] = await this.db
      .select()
      .from(feedPostPolls)
      .where(eq(feedPostPolls.postId, postId))
      .limit(1);
    if (!poll || poll.closesAt <= new Date())
      throw new Error("POLL_NOT_AVAILABLE");
    if (!poll.allowMultiple && input.optionIds.length !== 1)
      throw new Error("MULTIPLE_CHOICES_NOT_ALLOWED");
    const valid = await this.db
      .select({ id: feedPostPollOptions.id })
      .from(feedPostPollOptions)
      .where(
        and(
          eq(feedPostPollOptions.postId, postId),
          inArray(feedPostPollOptions.id, input.optionIds),
        ),
      );
    if (valid.length !== input.optionIds.length)
      throw new Error("POLL_OPTION_NOT_FOUND");
    const all = await this.db
      .select({ id: feedPostPollOptions.id })
      .from(feedPostPollOptions)
      .where(eq(feedPostPollOptions.postId, postId));
    await this.db.transaction(async (tx) => {
      if (all.length)
        await tx.delete(feedPostPollVotes).where(
          and(
            eq(feedPostPollVotes.userId, userId),
            inArray(
              feedPostPollVotes.optionId,
              all.map((o) => o.id),
            ),
          ),
        );
      await tx
        .insert(feedPostPollVotes)
        .values(input.optionIds.map((optionId) => ({ optionId, userId })));
    });
  }
  async viewStory(storyId: string, viewer: FeedAuthor) {
    await this.requireStory(storyId);
    await this.db
      .insert(storyViews)
      .values({ storyId, viewerId: viewer.id })
      .onConflictDoUpdate({
        target: [storyViews.storyId, storyViews.viewerId],
        set: { viewedAt: new Date() },
      });
  }
  async likeStory(storyId: string, userId: string, enabled: boolean) {
    const story = await this.requireStory(storyId);
    if (enabled) {
      await this.db
        .insert(storyLikes)
        .values({ storyId, userId })
        .onConflictDoNothing();
      const existing = await this.db
        .select({ id: storyReplies.id })
        .from(storyReplies)
        .where(
          and(
            eq(storyReplies.storyId, storyId),
            eq(storyReplies.senderId, userId),
            eq(storyReplies.body, "♥ Liked your story"),
          ),
        )
        .limit(1);
      if (!existing.length)
        await this.db.insert(storyReplies).values({
          storyId,
          senderId: userId,
          recipientId: story.authorId,
          body: "♥ Liked your story",
        });
    } else
      await this.db
        .delete(storyLikes)
        .where(
          and(eq(storyLikes.storyId, storyId), eq(storyLikes.userId, userId)),
        );
  }
  async replyStory(storyId: string, sender: FeedAuthor, body: string) {
    const story = await this.requireStory(storyId);
    const [row] = await this.db
      .insert(storyReplies)
      .values({
        storyId,
        senderId: sender.id,
        recipientId: story.authorId,
        body,
      })
      .returning();
    if (!row) throw new Error("STORY_REPLY_FAILED");
    const [recipient] = await this.db
      .select({
        id: profiles.userId,
        displayName: profiles.displayName,
        handle: profiles.handle,
      })
      .from(profiles)
      .where(eq(profiles.userId, story.authorId))
      .limit(1);
    if (!recipient) throw new Error("USER_NOT_FOUND");
    return {
      id: row.id,
      storyId,
      body,
      createdAt: row.createdAt.toISOString(),
      sender,
      recipient,
      isOwn: true,
    };
  }
  async storyViewers(storyId: string, ownerId: string) {
    const story = await this.requireStory(storyId);
    if (story.authorId !== ownerId) throw new Error("STORY_OWNER_REQUIRED");
    const rows = await this.db
      .select({
        user: {
          id: profiles.userId,
          displayName: profiles.displayName,
          handle: profiles.handle,
          verificationType: profiles.verificationType,
        },
        viewedAt: storyViews.viewedAt,
        likedUserId: storyLikes.userId,
      })
      .from(storyViews)
      .innerJoin(profiles, eq(profiles.userId, storyViews.viewerId))
      .leftJoin(
        storyLikes,
        and(
          eq(storyLikes.storyId, storyId),
          eq(storyLikes.userId, storyViews.viewerId),
        ),
      )
      .where(eq(storyViews.storyId, storyId))
      .orderBy(desc(storyViews.viewedAt));
    return rows.map((r) => ({
      user: {
        ...r.user,
        verificationType: r.user
          .verificationType as FeedAuthor["verificationType"],
      },
      viewedAt: r.viewedAt.toISOString(),
      liked: !!r.likedUserId,
    }));
  }
  async storyMessages(userId: string) {
    const rows = await this.db
      .select({
        reply: storyReplies,
        sender: {
          id: profiles.userId,
          displayName: profiles.displayName,
          handle: profiles.handle,
        },
      })
      .from(storyReplies)
      .innerJoin(profiles, eq(profiles.userId, storyReplies.senderId))
      .where(
        or(
          eq(storyReplies.senderId, userId),
          eq(storyReplies.recipientId, userId),
        ),
      )
      .orderBy(desc(storyReplies.createdAt));
    const recipientIds = [...new Set(rows.map((r) => r.reply.recipientId))];
    const recipients = recipientIds.length
      ? await this.db
          .select({
            id: profiles.userId,
            displayName: profiles.displayName,
            handle: profiles.handle,
          })
          .from(profiles)
          .where(inArray(profiles.userId, recipientIds))
      : [];
    return rows.map((r) => ({
      id: r.reply.id,
      storyId: r.reply.storyId,
      body: r.reply.body,
      createdAt: r.reply.createdAt.toISOString(),
      sender: r.sender,
      recipient: recipients.find((p) => p.id === r.reply.recipientId)!,
      isOwn: r.reply.senderId === userId,
    }));
  }
  async liveSessions(viewerId: string): Promise<LiveSession[]> {
    const followed = await this.db
      .select({ id: follows.followedId })
      .from(follows)
      .where(eq(follows.followerId, viewerId));
    const allowed = [viewerId, ...followed.map((f) => f.id)];
    const rows = await this.db
      .select({
        live: liveSessions,
        host: {
          id: profiles.userId,
          displayName: profiles.displayName,
          handle: profiles.handle,
        },
      })
      .from(liveSessions)
      .innerJoin(profiles, eq(profiles.userId, liveSessions.hostId))
      .where(
        and(
          eq(liveSessions.status, "live"),
          inArray(liveSessions.hostId, allowed),
        ),
      )
      .orderBy(desc(liveSessions.startedAt));
    return Promise.all(
      rows.map(async (r) => {
        const [total] = await this.db
          .select({ value: count() })
          .from(liveViewers)
          .where(
            and(
              eq(liveViewers.liveSessionId, r.live.id),
              isNull(liveViewers.leftAt),
            ),
          );
        return {
          id: r.live.id,
          host: r.host,
          title: r.live.title,
          status: r.live.status,
          startedAt: r.live.startedAt.toISOString(),
          endedAt: r.live.endedAt?.toISOString() ?? null,
          viewerCount: Number(total?.value ?? 0),
          isOwn: r.live.hostId === viewerId,
        };
      }),
    );
  }
  async startLive(host: FeedAuthor, title: string): Promise<LiveSession> {
    await this.db
      .update(liveSessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(
        and(eq(liveSessions.hostId, host.id), eq(liveSessions.status, "live")),
      );
    const [row] = await this.db
      .insert(liveSessions)
      .values({ hostId: host.id, title })
      .returning();
    if (!row) throw new Error("LIVE_CREATE_FAILED");
    const followerRows = await this.db
      .select({ id: follows.followerId })
      .from(follows)
      .where(eq(follows.followedId, host.id));
    if (followerRows.length) {
      await this.db.insert(notifications).values(
        followerRows.map((f) => ({
          recipientId: f.id,
          actorId: host.id,
          type: "live_started" as const,
          message: `${host.displayName} is live now`,
          liveSessionId: row.id,
        })),
      );
      void this.push(
        followerRows.map((f) => f.id),
        "Live now",
        `${host.displayName} started a Live`,
        { type: "live_started", liveSessionId: row.id },
      );
    }
    return {
      id: row.id,
      host,
      title: row.title,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      endedAt: null,
      viewerCount: 0,
      isOwn: true,
    };
  }
  async endLive(id: string, hostId: string) {
    const rows = await this.db
      .update(liveSessions)
      .set({ status: "ended", endedAt: new Date() })
      .where(
        and(
          eq(liveSessions.id, id),
          eq(liveSessions.hostId, hostId),
          eq(liveSessions.status, "live"),
        ),
      )
      .returning({ id: liveSessions.id });
    if (!rows.length) throw new Error("LIVE_NOT_FOUND");
  }
  async joinLive(id: string, viewerId: string, joined: boolean) {
    const [session] = await this.db
      .select({ id: liveSessions.id })
      .from(liveSessions)
      .where(and(eq(liveSessions.id, id), eq(liveSessions.status, "live")))
      .limit(1);
    if (!session) throw new Error("LIVE_NOT_FOUND");
    await this.db
      .insert(liveViewers)
      .values({
        liveSessionId: id,
        viewerId,
        leftAt: joined ? null : new Date(),
      })
      .onConflictDoUpdate({
        target: [liveViewers.liveSessionId, liveViewers.viewerId],
        set: joined
          ? { joinedAt: new Date(), leftAt: null }
          : { leftAt: new Date() },
      });
  }
  async liveComments(id: string): Promise<LiveComment[]> {
    const rows = await this.db
      .select({
        comment: liveComments,
        author: {
          id: profiles.userId,
          displayName: profiles.displayName,
          handle: profiles.handle,
        },
      })
      .from(liveComments)
      .innerJoin(profiles, eq(profiles.userId, liveComments.authorId))
      .where(eq(liveComments.liveSessionId, id))
      .orderBy(liveComments.createdAt);
    return rows.map((r) => ({
      id: r.comment.id,
      liveSessionId: id,
      author: r.author,
      body: r.comment.body,
      createdAt: r.comment.createdAt.toISOString(),
    }));
  }
  async addLiveComment(
    id: string,
    author: FeedAuthor,
    body: string,
  ): Promise<LiveComment> {
    const [session] = await this.db
      .select({ id: liveSessions.id })
      .from(liveSessions)
      .where(and(eq(liveSessions.id, id), eq(liveSessions.status, "live")))
      .limit(1);
    if (!session) throw new Error("LIVE_NOT_FOUND");
    const [row] = await this.db
      .insert(liveComments)
      .values({ liveSessionId: id, authorId: author.id, body })
      .returning();
    if (!row) throw new Error("LIVE_COMMENT_FAILED");
    return {
      id: row.id,
      liveSessionId: id,
      author,
      body,
      createdAt: row.createdAt.toISOString(),
    };
  }
  async notifications(userId: string) {
    const rows = await this.db
      .select({
        notification: notifications,
        actor: {
          id: profiles.userId,
          displayName: profiles.displayName,
          handle: profiles.handle,
        },
      })
      .from(notifications)
      .leftJoin(profiles, eq(profiles.userId, notifications.actorId))
      .where(eq(notifications.recipientId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(100);
    return rows.map((r) => ({
      id: r.notification.id,
      type: r.notification.type,
      actor: r.notification.actorId ? r.actor : null,
      message: r.notification.message,
      postId: r.notification.postId,
      liveSessionId: r.notification.liveSessionId,
      readAt: r.notification.readAt?.toISOString() ?? null,
      createdAt: r.notification.createdAt.toISOString(),
    }));
  }
  async readNotifications(userId: string, id?: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        id
          ? and(eq(notifications.recipientId, userId), eq(notifications.id, id))
          : eq(notifications.recipientId, userId),
      );
  }
  async notifyPost(
    postId: string,
    actor: FeedAuthor,
    type: "post_like" | "post_comment" | "mention",
  ) {
    const [post] = await this.db
      .select({ authorId: feedPosts.authorId })
      .from(feedPosts)
      .where(eq(feedPosts.id, postId))
      .limit(1);
    if (!post || post.authorId === actor.id) return;
    const message =
      type === "post_like"
        ? `${actor.displayName} liked your post`
        : type === "post_comment"
          ? `${actor.displayName} commented on your post`
          : `${actor.displayName} mentioned you`;
    await this.db.insert(notifications).values({
      recipientId: post.authorId,
      actorId: actor.id,
      type,
      postId,
      message,
    });
    void this.push([post.authorId], "SidCraft", message, { type, postId });
  }
  async notifyFollow(actor: FeedAuthor, targetId: string) {
    const reciprocal = await this.db
      .select({ id: follows.followerId })
      .from(follows)
      .where(
        and(eq(follows.followerId, targetId), eq(follows.followedId, actor.id)),
      )
      .limit(1);
    const type = reciprocal.length
      ? ("follow_back" as const)
      : ("follow" as const);
    const message = reciprocal.length
      ? `${actor.displayName} followed you back`
      : `${actor.displayName} started following you`;
    await this.db
      .insert(notifications)
      .values({ recipientId: targetId, actorId: actor.id, type, message });
    void this.push([targetId], "SidCraft", message, { type });
  }
  async notifyMentions(postId: string, actor: FeedAuthor, body: string) {
    const handles = [
      ...new Set(
        [...body.matchAll(/@([a-z0-9_]{3,30})/gi)].map((match) =>
          match[1]!.toLowerCase(),
        ),
      ),
    ];
    if (!handles.length) return;
    const mentioned = await this.db
      .select({ id: profiles.userId })
      .from(profiles)
      .where(inArray(profiles.handle, handles));
    const recipients = mentioned.filter((user) => user.id !== actor.id);
    if (recipients.length) {
      const message = `${actor.displayName} mentioned you`;
      await this.db.insert(notifications).values(
        recipients.map((user) => ({
          recipientId: user.id,
          actorId: actor.id,
          type: "mention" as const,
          message,
          postId,
        })),
      );
      void this.push(
        recipients.map((user) => user.id),
        "SidCraft",
        message,
        { type: "mention", postId },
      );
    }
  }
  async registerPushToken(
    userId: string,
    token: string,
    platform: "android" | "ios",
  ) {
    await this.db
      .insert(devicePushTokens)
      .values({ userId, token, platform })
      .onConflictDoUpdate({
        target: devicePushTokens.token,
        set: { userId, platform, updatedAt: new Date() },
      });
  }

  private async push(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    try {
      const rows = await this.db
        .select({ token: devicePushTokens.token })
        .from(devicePushTokens)
        .where(inArray(devicePushTokens.userId, userIds));
      if (!rows.length) return;
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          rows.map((row) => ({
            to: row.token,
            title,
            body,
            data,
            sound: "default",
            channelId: "social",
          })),
        ),
      });
    } catch {
      /* In-app notification remains the durable fallback. */
    }
  }

  private async requireStory(id: string) {
    const [story] = await this.db
      .select()
      .from(stories)
      .where(eq(stories.id, id))
      .limit(1);
    if (!story || story.expiresAt <= new Date())
      throw new Error("STORY_NOT_FOUND");
    return story;
  }

  private async requirePost(id: string) {
    const [post] = await this.db
      .select({ id: feedPosts.id })
      .from(feedPosts)
      .where(and(eq(feedPosts.id, id), eq(feedPosts.status, "active")))
      .limit(1);
    if (!post) throw new Error("POST_NOT_FOUND");
  }
  private async present(
    post: typeof feedPosts.$inferSelect,
    viewerId: string,
  ): Promise<FeedPost> {
    const [
      [author],
      [likeTotal],
      [commentTotal],
      [repostTotal],
      viewerLike,
      viewerFollow,
      viewerRepost,
      media,
    ] = await Promise.all([
      this.db
        .select({
          id: profiles.userId,
          displayName: profiles.displayName,
          handle: profiles.handle,
        })
        .from(profiles)
        .where(eq(profiles.userId, post.authorId))
        .limit(1),
      this.db
        .select({ value: count() })
        .from(feedPostLikes)
        .where(eq(feedPostLikes.postId, post.id)),
      this.db
        .select({ value: count() })
        .from(feedPostComments)
        .where(
          and(
            eq(feedPostComments.postId, post.id),
            eq(feedPostComments.status, "active"),
          ),
        ),
      this.db
        .select({ value: count() })
        .from(feedPostReposts)
        .where(eq(feedPostReposts.postId, post.id)),
      this.db
        .select({ userId: feedPostLikes.userId })
        .from(feedPostLikes)
        .where(
          and(
            eq(feedPostLikes.postId, post.id),
            eq(feedPostLikes.userId, viewerId),
          ),
        )
        .limit(1),
      this.db
        .select({ followerId: follows.followerId })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, viewerId),
            eq(follows.followedId, post.authorId),
          ),
        )
        .limit(1),
      this.db
        .select({ userId: feedPostReposts.userId })
        .from(feedPostReposts)
        .where(
          and(
            eq(feedPostReposts.postId, post.id),
            eq(feedPostReposts.userId, viewerId),
          ),
        )
        .limit(1),
      this.db
        .select({
          id: feedPostMedia.id,
          kind: feedPostMedia.kind,
          mimeType: feedPostMedia.mimeType,
          originalName: feedPostMedia.originalName,
          sizeBytes: feedPostMedia.sizeBytes,
          durationSeconds: feedPostMedia.durationSeconds,
        })
        .from(feedPostMedia)
        .where(eq(feedPostMedia.postId, post.id)),
    ]);
    if (!author) throw new Error("POST_AUTHOR_NOT_FOUND");
    const [threaded, poll] = await Promise.all([
      this.loadComments(post.id, viewerId),
      this.loadPoll(post.id, viewerId),
    ]);
    return {
      id: post.id,
      body: post.body,
      createdAt: post.createdAt.toISOString(),
      author: post.isAnonymous ? null : author,
      isAnonymous: post.isAnonymous,
      media: media.map((m) => ({ ...m, url: `/v1/feed/media/${m.id}` })),
      likeCount: Number(likeTotal?.value ?? 0),
      commentCount: Number(commentTotal?.value ?? 0),
      repostCount: Number(repostTotal?.value ?? 0),
      viewerLiked: viewerLike.length > 0,
      viewerReposted: viewerRepost.length > 0,
      viewerFollowsAuthor: viewerFollow.length > 0,
      isOwn: viewerId === post.authorId,
      recentComments: threaded.slice(-2),
      poll,
    };
  }

  private async loadPoll(
    postId: string,
    viewerId: string,
  ): Promise<FeedPost["poll"]> {
    const [poll] = await this.db
      .select()
      .from(feedPostPolls)
      .where(eq(feedPostPolls.postId, postId))
      .limit(1);
    if (!poll) return null;
    const options = await this.db
      .select()
      .from(feedPostPollOptions)
      .where(eq(feedPostPollOptions.postId, postId))
      .orderBy(feedPostPollOptions.position);
    const votes = options.length
      ? await this.db
          .select()
          .from(feedPostPollVotes)
          .where(
            inArray(
              feedPostPollVotes.optionId,
              options.map((o) => o.id),
            ),
          )
      : [];
    const uniqueVoters = new Set(votes.map((v) => v.userId));
    const total = uniqueVoters.size;
    return {
      question: poll.question,
      allowMultiple: poll.allowMultiple,
      closesAt: poll.closesAt.toISOString(),
      isClosed: poll.closesAt <= new Date(),
      totalVotes: total,
      options: options.map((option) => {
        const selected = votes.filter((v) => v.optionId === option.id);
        return {
          id: option.id,
          label: option.label,
          voteCount: selected.length,
          percentage: total
            ? Math.round((selected.length / total) * 1000) / 10
            : 0,
          viewerSelected: selected.some((v) => v.userId === viewerId),
        };
      }),
    };
  }

  private async loadComments(
    postId: string,
    viewerId: string,
  ): Promise<FeedComment[]> {
    const rows = await this.db
      .select({
        id: feedPostComments.id,
        body: feedPostComments.body,
        createdAt: feedPostComments.createdAt,
        parentCommentId: feedPostComments.parentCommentId,
        authorId: profiles.userId,
        displayName: profiles.displayName,
        handle: profiles.handle,
        verificationType: profiles.verificationType,
      })
      .from(feedPostComments)
      .innerJoin(profiles, eq(profiles.userId, feedPostComments.authorId))
      .where(
        and(
          eq(feedPostComments.postId, postId),
          eq(feedPostComments.status, "active"),
        ),
      )
      .orderBy(feedPostComments.createdAt);
    return rows
      .filter((r) => !r.parentCommentId)
      .map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        author: {
          id: r.authorId,
          displayName: r.displayName,
          handle: r.handle,
          verificationType:
            r.verificationType as FeedAuthor["verificationType"],
        },
        isOwn: r.authorId === viewerId,
        parentCommentId: null,
        replies: rows
          .filter((x) => x.parentCommentId === r.id)
          .map((x) => ({
            id: x.id,
            body: x.body,
            createdAt: x.createdAt.toISOString(),
            author: {
              id: x.authorId,
              displayName: x.displayName,
              handle: x.handle,
              verificationType:
                x.verificationType as FeedAuthor["verificationType"],
            },
            isOwn: x.authorId === viewerId,
            parentCommentId: r.id,
          })),
      }));
  }
}
