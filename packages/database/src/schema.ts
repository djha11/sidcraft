import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userStatus = pgEnum("user_status", [
  "active",
  "restricted",
  "suspended",
  "deleted",
]);
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    status: userStatus("status").notNull().default("active"),
    emailVerified: boolean("email_verified").notNull().default(false),
    acceptedTermsAt: timestamp("accepted_terms_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  settings: jsonb("settings").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 60 }).notNull(),
    handle: varchar("handle", { length: 32 }).notNull(),
    bio: varchar("bio", { length: 280 }),
    website: varchar("website", { length: 500 }),
    verificationType: varchar("verification_type", { length: 24 }),
    avatarKind: varchar("avatar_kind", { length: 10 }),
    avatarMimeType: varchar("avatar_mime_type", { length: 100 }),
    avatarDataBase64: text("avatar_data_base64"),
    avatarScale: integer("avatar_scale").notNull().default(1000),
    avatarOffsetX: integer("avatar_offset_x").notNull().default(0),
    avatarOffsetY: integer("avatar_offset_y").notNull().default(0),
    countryCode: varchar("country_code", { length: 2 }),
    languageCode: varchar("language_code", { length: 10 })
      .notNull()
      .default("en"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("profiles_handle_unique").on(t.handle)],
);

export const verificationRequests = pgTable(
  "verification_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedType: varchar("requested_type", { length: 24 }).notNull(),
    evidenceUrl: text("evidence_url"),
    note: varchar("note", { length: 600 }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    reviewNote: varchar("review_note", { length: 600 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    index("verification_requests_user_idx").on(t.userId),
    index("verification_requests_status_idx").on(t.status, t.createdAt),
  ],
);

export const moderationActions = pgTable("moderation_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: varchar("target_type", { length: 24 }).notNull(),
  targetId: uuid("target_id").notNull(),
  action: varchar("action", { length: 24 }).notNull(),
  reason: varchar("reason", { length: 600 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adCampaigns = pgTable("ad_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  advertiser: varchar("advertiser", { length: 120 }).notNull(),
  headline: varchar("headline", { length: 180 }).notNull(),
  destinationUrl: text("destination_url").notNull(),
  mediaUrl: text("media_url"),
  status: varchar("status", { length: 16 }).notNull().default("draft"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminBroadcasts = pgTable("admin_broadcasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 140 }).notNull(),
  message: varchar("message", { length: 600 }).notNull(),
  audience: varchar("audience", { length: 40 }).notNull().default("everyone"),
  status: varchar("status", { length: 16 }).notNull().default("sent"),
  deepLink: varchar("deep_link", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    tokenFamilyId: uuid("token_family_id").notNull(),
    replacedBySessionId: uuid("replaced_by_session_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const emailOtpPurpose = pgEnum("email_otp_purpose", [
  "signup",
  "password_reset",
]);
export const emailOtpChallenges = pgTable(
  "email_otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 254 }).notNull(),
    purpose: emailOtpPurpose("purpose").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("email_otp_lookup_idx").on(t.email, t.purpose, t.createdAt)],
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followedId: uuid("followed_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followedId] })],
);

export const postStatus = pgEnum("post_status", [
  "active",
  "hidden",
  "removed",
]);
export const feedPosts = pgTable(
  "feed_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: varchar("body", { length: 1_000 }).notNull(),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    status: postStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("feed_posts_created_idx").on(t.createdAt),
    index("feed_posts_author_idx").on(t.authorId),
  ],
);

export const feedMediaKind = pgEnum("feed_media_kind", [
  "image",
  "video",
  "document",
]);
export const feedPostMedia = pgTable(
  "feed_post_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    kind: feedMediaKind("kind").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    dataBase64: text("data_base64").notNull(),
    durationSeconds: integer("duration_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("feed_post_media_post_idx").on(t.postId)],
);

export const feedPostLikes = pgTable(
  "feed_post_likes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const feedPostComments = pgTable(
  "feed_post_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id").references(
      (): AnyPgColumn => feedPostComments.id,
      { onDelete: "cascade" },
    ),
    body: varchar("body", { length: 500 }).notNull(),
    status: postStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("feed_post_comments_post_idx").on(t.postId, t.createdAt)],
);

export const feedPostReposts = pgTable(
  "feed_post_reposts",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const feedPostPolls = pgTable("feed_post_polls", {
  postId: uuid("post_id")
    .primaryKey()
    .references(() => feedPosts.id, { onDelete: "cascade" }),
  question: varchar("question", { length: 280 }).notNull(),
  allowMultiple: boolean("allow_multiple").notNull().default(false),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
});
export const feedPostPollOptions = pgTable(
  "feed_post_poll_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPostPolls.postId, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }).notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    uniqueIndex("feed_poll_option_position_unique").on(t.postId, t.position),
  ],
);
export const feedPostPollVotes = pgTable(
  "feed_post_poll_votes",
  {
    optionId: uuid("option_id")
      .notNull()
      .references(() => feedPostPollOptions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.optionId, t.userId] })],
);

export const feedReportReason = pgEnum("feed_report_reason", [
  "spam",
  "harassment",
  "hate",
  "misinformation",
  "other",
]);
export const feedPostReports = pgTable(
  "feed_post_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: feedReportReason("reason").notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("feed_post_reports_reporter_unique").on(t.postId, t.reporterId),
  ],
);

export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const stories = pgTable(
  "stories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: feedMediaKind("kind").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    dataBase64: text("data_base64").notNull(),
    durationSeconds: integer("duration_seconds"),
    caption: varchar("caption", { length: 280 }).notNull().default(""),
    isHighlight: boolean("is_highlight").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("stories_author_expires_idx").on(t.authorId, t.expiresAt)],
);
export const storyViews = pgTable(
  "story_views",
  {
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    viewerId: uuid("viewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.viewerId] })],
);
export const storyLikes = pgTable(
  "story_likes",
  {
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.userId] })],
);
export const storyReplies = pgTable(
  "story_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: varchar("body", { length: 500 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("story_replies_recipient_created_idx").on(t.recipientId, t.createdAt),
  ],
);

export const conversationStatus = pgEnum("conversation_status", [
  "requested",
  "accepted",
]);
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userOneId: uuid("user_one_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userTwoId: uuid("user_two_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedForId: uuid("requested_for_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    status: conversationStatus("status").notNull().default("requested"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("conversations_pair_unique").on(t.userOneId, t.userTwoId),
    index("conversations_one_updated_idx").on(t.userOneId, t.updatedAt),
    index("conversations_two_updated_idx").on(t.userTwoId, t.updatedAt),
  ],
);
export const directMessages = pgTable(
  "direct_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: varchar("body", { length: 1_000 }).notNull(),
    attachment: jsonb("attachment").$type<{
      kind: "image" | "video" | "audio" | "file";
      mimeType: string;
      originalName: string;
      sizeBytes: number;
      dataBase64: string;
    }>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("direct_messages_conversation_created_idx").on(
      t.conversationId,
      t.createdAt,
    ),
  ],
);

export const liveStatus = pgEnum("live_status", ["live", "ended"]);
export const liveSessions = pgTable(
  "live_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull().default(""),
    status: liveStatus("status").notNull().default("live"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("live_sessions_status_started_idx").on(t.status, t.startedAt)],
);
export const liveViewers = pgTable(
  "live_viewers",
  {
    liveSessionId: uuid("live_session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    viewerId: uuid("viewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.liveSessionId, t.viewerId] })],
);
export const liveComments = pgTable(
  "live_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    liveSessionId: uuid("live_session_id")
      .notNull()
      .references(() => liveSessions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: varchar("body", { length: 300 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("live_comments_session_created_idx").on(t.liveSessionId, t.createdAt),
  ],
);
export const notificationType = pgEnum("notification_type", [
  "follow",
  "follow_back",
  "post_like",
  "post_comment",
  "mention",
  "live_started",
]);
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: notificationType("type").notNull(),
    message: varchar("message", { length: 240 }).notNull(),
    postId: uuid("post_id").references(() => feedPosts.id, {
      onDelete: "cascade",
    }),
    liveSessionId: uuid("live_session_id").references(() => liveSessions.id, {
      onDelete: "cascade",
    }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_recipient_created_idx").on(t.recipientId, t.createdAt),
  ],
);
export const devicePushTokens = pgTable(
  "device_push_tokens",
  {
    token: varchar("token", { length: 255 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 10 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("device_push_tokens_user_idx").on(t.userId)],
);

export const publicationKind = pgEnum("publication_kind", ["news", "reel"]);
export const publicationCategory = pgEnum("publication_category", [
  "politics",
  "sports",
  "entertainment",
  "business",
  "stocks",
  "tech",
  "india",
  "world",
]);
export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: publicationKind("kind").notNull(),
    category: publicationCategory("category").notNull(),
    headline: varchar("headline", { length: 180 }).notNull(),
    summary: varchar("summary", { length: 1_200 }).notNull(),
    mediaUrl: text("media_url").notNull(),
    media: jsonb("media")
      .$type<
        Array<{
          url: string;
          kind: "image" | "video";
          mimeType?: string | undefined;
        }>
      >()
      .notNull()
      .default([]),
    sourceName: varchar("source_name", { length: 120 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    evidenceNote: varchar("evidence_note", { length: 500 }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("publications_kind_published_idx").on(t.kind, t.publishedAt)],
);

export const newsSources = pgTable("news_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  feedUrl: text("feed_url").notNull().unique(),
  websiteUrl: text("website_url"),
  category: publicationCategory("category").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  pollingMinutes: integer("polling_minutes").notNull().default(15),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const newsCandidates = pgTable(
  "news_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => newsSources.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull().unique(),
    originalHeadline: varchar("original_headline", { length: 500 }).notNull(),
    description: text("description").notNull().default(""),
    suggestedMediaUrl: text("suggested_media_url"),
    storyId: uuid("story_id").notNull().defaultRandom(),
    draftMethod: varchar("draft_method", { length: 32 })
      .notNull()
      .default("source_excerpt"),
    sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }),
    status: varchar("status", { length: 24 }).notNull().default("needs_review"),
    finalHeadline: varchar("final_headline", { length: 180 }),
    finalSummary: varchar("final_summary", { length: 1200 }),
    mediaUrl: text("media_url"),
    mediaAttribution: text("media_attribution"),
    publicationId: uuid("publication_id").references(() => publications.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("news_candidates_status_created_idx").on(t.status, t.createdAt),
    index("news_candidates_story_idx").on(t.storyId, t.status),
  ],
);

export const regionKind = pgEnum("region_kind", ["state", "union_territory"]);
export const indiaRegions = pgTable("india_regions", {
  code: varchar("code", { length: 2 }).primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  kind: regionKind("kind").notNull(),
  lokSabhaSeats: integer("lok_sabha_seats").notNull(),
  rajyaSabhaSeats: integer("rajya_sabha_seats").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceCheckedAt: timestamp("source_checked_at", {
    withTimezone: true,
  }).notNull(),
});
export const constituencyReservation = pgEnum("constituency_reservation", [
  "GENERAL",
  "SC",
  "ST",
]);
export const lokSabhaConstituencies = pgTable(
  "lok_sabha_constituencies",
  {
    code: varchar("code", { length: 16 }).primaryKey(),
    stateCode: varchar("state_code", { length: 2 })
      .notNull()
      .references(() => indiaRegions.code, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    reservation: constituencyReservation("reservation").notNull(),
    sourceUrl: text("source_url").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("lok_sabha_state_number_unique").on(t.stateCode, t.number),
    index("lok_sabha_state_idx").on(t.stateCode),
  ],
);
export const locationSource = pgEnum("location_source", ["device", "manual"]);
export const locationPrecision = pgEnum("location_precision", [
  "state",
  "constituency",
]);
export const userLocationPreferences = pgTable("user_location_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  stateCode: varchar("state_code", { length: 2 })
    .notNull()
    .references(() => indiaRegions.code, { onDelete: "restrict" }),
  lokSabhaConstituencyCode: varchar("lok_sabha_constituency_code", {
    length: 16,
  }).references(() => lokSabhaConstituencies.code, { onDelete: "set null" }),
  source: locationSource("source").notNull(),
  precision: locationPrecision("precision").notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pollStatus = pgEnum("poll_status", [
  "draft",
  "active",
  "closed",
  "cancelled",
]);
export const pollResponseType = pgEnum("poll_response_type", [
  "choice",
  "open_text",
]);
export const pollCommentMode = pgEnum("poll_comment_mode", [
  "disabled",
  "optional",
  "required",
]);
export const pollAudienceScope = pgEnum("poll_audience_scope", [
  "global",
  "country",
  "india",
  "state",
  "lok_sabha",
]);
export const polls = pgTable("polls", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: varchar("question", { length: 280 }).notNull(),
  topic: varchar("topic", { length: 80 }).notNull(),
  status: pollStatus("status").notNull().default("draft"),
  responseType: pollResponseType("response_type").notNull().default("choice"),
  commentMode: pollCommentMode("comment_mode").notNull().default("disabled"),
  audienceScope: pollAudienceScope("audience_scope").notNull().default("india"),
  targetCountryCode: varchar("target_country_code", { length: 2 }).default(
    "IN",
  ),
  targetStateCode: varchar("target_state_code", { length: 2 }).references(
    () => indiaRegions.code,
    { onDelete: "restrict" },
  ),
  targetLokSabhaConstituencyCode: varchar(
    "target_lok_sabha_constituency_code",
    { length: 16 },
  ).references(() => lokSabhaConstituencies.code, { onDelete: "restrict" }),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  mediaKind: varchar("media_kind", { length: 8 }),
  mediaUrl: text("media_url"),
  mediaOriginalName: varchar("media_original_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const pollOptions = pgTable(
  "poll_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 160 }).notNull(),
    mediaUrl: text("media_url"),
    position: integer("position").notNull(),
  },
  (t) => [uniqueIndex("poll_options_position_unique").on(t.pollId, t.position)],
);
export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    optionId: uuid("option_id").references(() => pollOptions.id, {
      onDelete: "restrict",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    privateAnswer: text("private_answer"),
    privateComment: text("private_comment"),
    accepted: boolean("accepted").notNull().default(true),
    riskScore: integer("risk_score").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("votes_poll_user_unique").on(t.pollId, t.userId),
    index("votes_poll_idx").on(t.pollId),
  ],
);

export const analyticsRole = pgEnum("analytics_role", [
  "poll_admin",
  "analyst",
  "business_viewer",
]);
export const analyticsAccess = pgTable(
  "analytics_access",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: analyticsRole("role").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);
