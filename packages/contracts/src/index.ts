import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(10).max(128);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(30)
  .regex(
    /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])?$/,
    "Use 3–30 lowercase letters, numbers, periods, or underscores; start and end with a letter or number.",
  );

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(60),
  username: usernameSchema.optional(),
  otp: z.string().regex(/^\d{6}$/),
  acceptedTerms: z.literal(true),
});

export const otpPurposeSchema = z.enum(["signup", "password_reset"]);
export const requestEmailOtpSchema = z.object({
  email: emailSchema,
  purpose: otpPurposeSchema,
});
export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    otp: z.string().regex(/^\d{6}$/),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const usernameAvailabilityQuerySchema = z
  .object({
    username: usernameSchema.optional(),
    displayName: z.string().trim().min(2).max(60).optional(),
  })
  .refine(
    (value) => value.username || value.displayName,
    "A username or display name is required.",
  );

export const usernameAvailabilitySchema = z.object({
  username: usernameSchema.nullable(),
  available: z.boolean().nullable(),
  suggestions: z.array(usernameSchema).max(5),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  displayName: z.string(),
  handle: z.string(),
  createdAt: z.string().datetime(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: publicUserSchema,
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});
export const logoutRequestSchema = refreshRequestSchema;

export const pollResponseTypeSchema = z.enum(["choice", "open_text"]);
export const pollCommentModeSchema = z.enum([
  "disabled",
  "optional",
  "required",
]);
export const pollAudienceScopeSchema = z.enum([
  "global",
  "country",
  "india",
  "state",
  "lok_sabha",
]);
export const pollOptionSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  position: z.number().int(),
  mediaUrl: z.string().max(2_000_000).nullable().optional(),
  percentage: z.number().min(0).max(100).optional(),
});
export const pollTargetSchema = z.object({
  scope: pollAudienceScopeSchema,
  countryCode: z.string().length(2).nullable().default("IN"),
  stateCode: z.string().length(2).nullable(),
  lokSabhaConstituencyCode: z.string().nullable(),
});
export const pollMediaSchema = z.object({
  kind: z.enum(["image", "video"]),
  url: z.string().min(1).max(8_000_000),
  originalName: z.string().max(255).nullable().optional(),
});
export const pollSchema = z.object({
  id: z.string().uuid(),
  question: z.string(),
  topic: z.string(),
  closesAt: z.string().datetime(),
  responseType: pollResponseTypeSchema,
  commentMode: pollCommentModeSchema,
  target: pollTargetSchema,
  responseCount: z.number().int().nonnegative(),
  viewerHasVoted: z.boolean(),
  selectedOptionId: z.string().uuid().nullable(),
  options: z.array(pollOptionSchema),
  media: pollMediaSchema.nullable(),
});
export const voteRequestSchema = z.object({
  optionId: z.string().uuid().optional(),
  answer: z.string().trim().min(1).max(2_000).optional(),
  comment: z.string().trim().min(1).max(1_000).optional(),
});

export const lokSabhaConstituencySchema = z.object({
  code: z.string(),
  stateCode: z.string().length(2),
  stateName: z.string(),
  number: z.number().int().positive(),
  name: z.string(),
  reservation: z.enum(["GENERAL", "SC", "ST"]),
});
export const indiaRegionSchema = z.object({
  code: z.string().length(2),
  name: z.string(),
  kind: z.enum(["state", "union_territory"]),
  lokSabhaSeats: z.number().int().nonnegative(),
  rajyaSabhaSeats: z.number().int().nonnegative(),
});
export const locationPreferenceSchema = z.object({
  consent: z.literal(true),
  source: z.enum(["device", "manual"]),
  stateCode: z.string().length(2),
  lokSabhaConstituencyCode: z.string().nullable().optional(),
});
export const locationProfileSchema = z.object({
  stateCode: z.string().length(2),
  stateName: z.string(),
  lokSabhaConstituencyCode: z.string().nullable(),
  lokSabhaConstituencyName: z.string().nullable(),
  precision: z.enum(["state", "constituency"]),
  updatedAt: z.string().datetime(),
});

export const createPollRequestSchema = z
  .object({
    question: z.string().trim().min(8).max(280),
    topic: z.string().trim().min(2).max(80),
    responseType: pollResponseTypeSchema,
    commentMode: pollCommentModeSchema,
    options: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
    optionMediaUrls: z
      .array(z.string().max(2_000_000).nullable())
      .max(8)
      .default([]),
    opensAt: z.string().datetime(),
    closesAt: z.string().datetime(),
    target: pollTargetSchema,
    media: pollMediaSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.responseType === "choice" && value.options.length < 2)
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Choice polls require at least two options",
      });
    if (value.responseType === "open_text" && value.options.length)
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Open-text questions cannot have options",
      });
    if (
      (value.target.scope === "india" ||
        value.target.scope === "country" ||
        value.target.scope === "global") &&
      (value.target.stateCode || value.target.lokSabhaConstituencyCode)
    )
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: "Global and country polls cannot have a regional target",
      });
    if (
      value.target.scope === "state" &&
      (!value.target.stateCode || value.target.lokSabhaConstituencyCode)
    )
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: "State polls require only a state code",
      });
    if (
      value.target.scope === "lok_sabha" &&
      (!value.target.stateCode || !value.target.lokSabhaConstituencyCode)
    )
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: "Lok Sabha polls require state and constituency codes",
      });
  });
export const analyticsAnswerSchema = z.object({
  answer: z.string().nullable(),
  comment: z.string().nullable(),
  submittedOn: z.string().date(),
});
export const pollAnalyticsSchema = z.object({
  pollId: z.string().uuid(),
  question: z.string(),
  responseType: pollResponseTypeSchema,
  responseCount: z.number().int().nonnegative(),
  anonymousAnswers: z.array(analyticsAnswerSchema),
  notice: z.string(),
});

export const feedAuthorSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  handle: z.string(),
  verificationType: z
    .enum(["general", "grey", "government", "media", "business"])
    .nullable()
    .optional(),
});
export const feedReplySchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  createdAt: z.string().datetime(),
  author: feedAuthorSchema,
  isOwn: z.boolean(),
  parentCommentId: z.string().uuid(),
});
export const feedCommentSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  createdAt: z.string().datetime(),
  author: feedAuthorSchema,
  isOwn: z.boolean(),
  parentCommentId: z.null(),
  replies: z.array(feedReplySchema),
});
export const feedMediaKindSchema = z.enum(["image", "video", "document"]);
export const feedMediaSchema = z.object({
  id: z.string().uuid(),
  kind: feedMediaKindSchema,
  mimeType: z.string(),
  originalName: z.string(),
  sizeBytes: z.number().int().positive(),
  url: z.string(),
  durationSeconds: z.number().int().positive().nullable(),
});
export const feedPostSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  createdAt: z.string().datetime(),
  author: feedAuthorSchema.nullable(),
  isAnonymous: z.boolean(),
  media: z.array(feedMediaSchema),
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  repostCount: z.number().int().nonnegative(),
  viewerLiked: z.boolean(),
  viewerReposted: z.boolean(),
  viewerFollowsAuthor: z.boolean(),
  isOwn: z.boolean(),
  recentComments: z.array(feedCommentSchema),
  poll: z
    .object({
      question: z.string(),
      allowMultiple: z.boolean(),
      closesAt: z.string().datetime(),
      isClosed: z.boolean(),
      totalVotes: z.number().int().nonnegative(),
      options: z.array(
        z.object({
          id: z.string().uuid(),
          label: z.string(),
          voteCount: z.number().int().nonnegative(),
          percentage: z.number().min(0).max(100),
          viewerSelected: z.boolean(),
        }),
      ),
    })
    .nullable(),
});
export const feedPageSchema = z.object({
  items: z.array(feedPostSchema),
  nextCursor: z.string().datetime().nullable(),
});
export const trendingTopicSchema = z.object({
  tag: z.string(),
  postCount: z.number().int().nonnegative(),
  reelCount: z.number().int().nonnegative(),
  score: z.number().nonnegative(),
});
export const trendingFeedSchema = z.object({
  topics: z.array(trendingTopicSchema),
  items: z.array(feedPostSchema),
});
export const searchResultsSchema = z.object({
  people: z.array(feedAuthorSchema),
  posts: z.array(feedPostSchema),
  reels: z.array(feedPostSchema),
  topics: z.array(trendingTopicSchema),
});
export const profileOverviewSchema = z.object({
  user: feedAuthorSchema.extend({
    bio: z.string().nullable(),
    website: z.string().nullable(),
    avatar: z
      .object({
        kind: z.enum(["image", "video"]),
        url: z.string(),
        scale: z.number().min(1).max(4),
        offsetX: z.number().min(-1).max(1),
        offsetY: z.number().min(-1).max(1),
      })
      .nullable(),
  }),
  isOwn: z.boolean(),
  viewerFollows: z.boolean(),
  counts: z.object({
    posts: z.number().int().nonnegative(),
    anonymous: z.number().int().nonnegative().nullable(),
    followers: z.number().int().nonnegative(),
    following: z.number().int().nonnegative(),
  }),
  posts: z.array(feedPostSchema),
  reels: z.array(feedPostSchema),
  anonymous: z.array(feedPostSchema),
  reposts: z.array(feedPostSchema),
  tagged: z.array(feedPostSchema),
  highlights: z.array(z.lazy(() => storySchema)),
});
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  username: usernameSchema,
  bio: z.string().trim().max(280).nullable().default(null),
  website: z.string().trim().url().max(500).nullable().default(null),
  avatar: z
    .object({
      kind: z.enum(["image", "video"]),
      mimeType: z.string().min(1).max(100),
      base64: z.string().min(1),
      scale: z.number().min(1).max(4).default(1),
      offsetX: z.number().min(-1).max(1).default(0),
      offsetY: z.number().min(-1).max(1).default(0),
    })
    .nullable()
    .optional(),
});
export const createFeedPostSchema = z
  .object({
    body: z.string().trim().max(1_000).default(""),
    anonymous: z.boolean().default(false),
    media: z
      .array(
        z.object({
          kind: feedMediaKindSchema,
          mimeType: z.string().min(1).max(100),
          originalName: z.string().min(1).max(255),
          sizeBytes: z.number().int().positive().max(20_000_000),
          base64: z.string().min(1),
          durationSeconds: z
            .number()
            .int()
            .positive()
            .max(21_600)
            .nullable()
            .optional(),
        }),
      )
      .max(4)
      .default([]),
    poll: z
      .object({
        question: z.string().trim().min(1).max(280),
        options: z
          .array(z.string().trim().min(1).max(100))
          .min(2)
          .max(6)
          .refine(
            (items) =>
              new Set(items.map((item) => item.toLowerCase())).size ===
              items.length,
            "Poll options must be unique",
          ),
        allowMultiple: z.boolean().default(false),
        durationMinutes: z.number().int().min(5).max(43_200),
      })
      .nullable()
      .optional(),
  })
  .refine(
    (value) => value.body.length > 0 || value.media.length > 0 || !!value.poll,
    {
      message: "A post needs text or an attachment",
    },
  );
export const createFeedCommentSchema = z.object({
  body: z.string().trim().min(1).max(500),
  parentCommentId: z.string().uuid().nullable().optional(),
});
export const feedReportReasonSchema = z.enum([
  "spam",
  "harassment",
  "hate",
  "misinformation",
  "other",
]);
export const createFeedReportSchema = z.object({
  reason: feedReportReasonSchema,
  note: z.string().trim().max(500).optional(),
});

export const publicationKindSchema = z.enum(["news", "reel"]);
export const publicationCategorySchema = z.enum([
  "politics",
  "sports",
  "entertainment",
  "business",
  "stocks",
  "tech",
  "india",
  "world",
]);
export const publicationMediaSchema = z.object({
  url: z.string().min(1),
  kind: z.enum(["image", "video"]),
  mimeType: z.string().min(1).optional(),
});
export const publicationMediaUploadSchema = z.object({
  kind: z.enum(["image", "video"]),
  mimeType: z.string().min(1),
  originalName: z.string().min(1).max(255),
  base64: z.string().min(1),
});
export const publicationSchema = z.object({
  id: z.string().uuid(),
  kind: publicationKindSchema,
  category: publicationCategorySchema,
  headline: z.string(),
  summary: z.string(),
  mediaUrl: z.string().min(1),
  media: z.array(publicationMediaSchema).min(1).max(10).optional(),
  sourceName: z.string(),
  sourceUrl: z.string().url(),
  evidenceNote: z.string(),
  publishedAt: z.string().datetime(),
  author: feedAuthorSchema.nullable().optional(),
  feedPostId: z.string().uuid().nullable().optional(),
  isOwn: z.boolean().optional(),
});
export const publicationPageSchema = z.object({
  items: z.array(publicationSchema),
});
export const createPublicationSchema = z
  .object({
    kind: publicationKindSchema,
    category: publicationCategorySchema,
    headline: z.string().trim().min(5).max(180),
    summary: z.string().trim().min(10).max(1_200),
    mediaUrl: z.string().url().optional(),
    mediaUrls: z.array(z.string().url()).max(10).optional(),
    media: z.array(publicationMediaUploadSchema).max(10).optional(),
    sourceName: z.string().trim().min(2).max(120),
    sourceUrl: z.string().url(),
    evidenceNote: z.string().trim().max(500).optional().default(""),
  })
  .refine(
    (value) =>
      Boolean(value.mediaUrl || value.mediaUrls?.length || value.media?.length),
    {
      message: "At least one media URL or upload is required",
      path: ["media"],
    },
  );

export const storySchema = z.object({
  id: z.string().uuid(),
  author: feedAuthorSchema,
  media: feedMediaSchema,
  caption: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  isOwn: z.boolean(),
  viewerLiked: z.boolean(),
  viewerSeen: z.boolean(),
  viewerCount: z.number().int().nonnegative(),
  replyCount: z.number().int().nonnegative(),
  isHighlight: z.boolean(),
});
export const createStorySchema = z.object({
  caption: z.string().trim().max(280).default(""),
  isHighlight: z.boolean().default(false),
  media: z.object({
    kind: z.enum(["image", "video"]),
    mimeType: z.string().min(1).max(100),
    originalName: z.string().min(1).max(255),
    sizeBytes: z.number().int().positive().max(20_000_000),
    base64: z.string().min(1),
    durationSeconds: z.number().int().positive().max(180).nullable().optional(),
  }),
});
export const storyViewerSchema = z.object({
  user: feedAuthorSchema,
  viewedAt: z.string().datetime(),
  liked: z.boolean(),
});
export const storyMessageSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  body: z.string(),
  createdAt: z.string().datetime(),
  sender: feedAuthorSchema,
  recipient: feedAuthorSchema,
  isOwn: z.boolean(),
});
export const createStoryReplySchema = z.object({
  body: z.string().trim().min(1).max(500),
});
export const directMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  sender: feedAuthorSchema,
  body: z.string(),
  attachment: z
    .object({
      kind: z.enum(["image", "video", "audio", "file"]),
      mimeType: z.string(),
      originalName: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      url: z.string(),
    })
    .nullable(),
  isOwn: z.boolean(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export const conversationSchema = z.object({
  id: z.string().uuid(),
  otherUser: feedAuthorSchema,
  status: z.enum(["requested", "accepted"]),
  isIncomingRequest: z.boolean(),
  lastMessage: directMessageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});
export const sendDirectMessageSchema = z
  .object({
    recipientId: z.string().uuid().optional(),
    body: z.string().trim().max(1_000).default(""),
    attachment: z
      .object({
        kind: z.enum(["image", "video", "audio", "file"]),
        mimeType: z.string().min(1).max(100),
        originalName: z.string().min(1).max(255),
        sizeBytes: z.number().int().positive().max(25_000_000),
        base64: z.string().min(1).max(35_000_000),
      })
      .optional(),
  })
  .refine((value) => value.body.length > 0 || !!value.attachment, {
    message: "A message needs text or an attachment",
  });
export const notificationTypeSchema = z.enum([
  "follow",
  "follow_back",
  "post_like",
  "post_comment",
  "mention",
  "live_started",
]);
export const appNotificationSchema = z.object({
  id: z.string().uuid(),
  type: notificationTypeSchema,
  actor: feedAuthorSchema.nullable(),
  message: z.string(),
  postId: z.string().uuid().nullable(),
  liveSessionId: z.string().uuid().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export const liveSessionSchema = z.object({
  id: z.string().uuid(),
  host: feedAuthorSchema,
  title: z.string(),
  status: z.enum(["live", "ended"]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  viewerCount: z.number().int().nonnegative(),
  isOwn: z.boolean(),
});
export const createLiveSessionSchema = z.object({
  title: z.string().trim().max(120).default(""),
});
export const liveCommentSchema = z.object({
  id: z.string().uuid(),
  liveSessionId: z.string().uuid(),
  author: feedAuthorSchema,
  body: z.string(),
  createdAt: z.string().datetime(),
});
export const createLiveCommentSchema = z.object({
  body: z.string().trim().min(1).max(300),
});
export const liveCredentialsSchema = z.object({
  serverUrl: z.string().min(1),
  token: z.string().min(1),
  roomName: z.string().min(1),
});
export const registerPushTokenSchema = z.object({
  token: z
    .string()
    .regex(/^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/),
  platform: z.enum(["android", "ios"]),
});
export const voteFeedPollSchema = z.object({
  optionIds: z.array(z.string().uuid()).min(1).max(6),
});

export const userPreferencesSchema = z.object({
  privateAccount: z.boolean().default(false),
  activityStatus: z.boolean().default(true),
  allowStoryReplies: z.boolean().default(true),
  allowMessageRequests: z.boolean().default(true),
  allowTags: z.boolean().default(true),
  allowMentions: z.boolean().default(true),
  allowComments: z.boolean().default(true),
  allowSharing: z.boolean().default(true),
  limitInteractions: z.boolean().default(false),
  hideCounts: z.boolean().default(false),
  autoplayMedia: z.boolean().default(true),
  highQualityUploads: z.boolean().default(true),
  dataSaver: z.boolean().default(false),
  notifications: z.boolean().default(true),
  sounds: z.boolean().default(true),
  reduceMotion: z.boolean().default(false),
  largeText: z.boolean().default(false),
  saveOriginalMedia: z.boolean().default(true),
  evidenceFirst: z.boolean().default(true),
  anonymousReplies: z.boolean().default(true),
  language: z.string().min(2).max(40).default("English"),
  sensitiveContent: z.enum(["Less", "Standard", "More"]).default("Standard"),
  dailyLimit: z.enum(["Off", "30 minutes", "1 hour", "2 hours"]).default("Off"),
});
export const updateUserPreferencesSchema = userPreferencesSchema
  .partial()
  .strict();

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type Poll = z.infer<typeof pollSchema>;
export type VoteRequest = z.infer<typeof voteRequestSchema>;
export type PollResponseType = z.infer<typeof pollResponseTypeSchema>;
export type PollCommentMode = z.infer<typeof pollCommentModeSchema>;
export type PollTarget = z.infer<typeof pollTargetSchema>;
export type CreatePollRequest = z.infer<typeof createPollRequestSchema>;
export type LokSabhaConstituency = z.infer<typeof lokSabhaConstituencySchema>;
export type IndiaRegion = z.infer<typeof indiaRegionSchema>;
export type LocationPreference = z.infer<typeof locationPreferenceSchema>;
export type LocationProfile = z.infer<typeof locationProfileSchema>;
export type PollAnalytics = z.infer<typeof pollAnalyticsSchema>;
export type FeedAuthor = z.infer<typeof feedAuthorSchema>;
export type FeedComment = z.infer<typeof feedCommentSchema>;
export type FeedReply = z.infer<typeof feedReplySchema>;
export type FeedMedia = z.infer<typeof feedMediaSchema>;
export type FeedMediaKind = z.infer<typeof feedMediaKindSchema>;
export type FeedPost = z.infer<typeof feedPostSchema>;
export type FeedPage = z.infer<typeof feedPageSchema>;
export type TrendingTopic = z.infer<typeof trendingTopicSchema>;
export type TrendingFeed = z.infer<typeof trendingFeedSchema>;
export type SearchResults = z.infer<typeof searchResultsSchema>;
export type ProfileOverview = z.infer<typeof profileOverviewSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
export type CreateFeedPost = z.infer<typeof createFeedPostSchema>;
export type CreateFeedComment = z.infer<typeof createFeedCommentSchema>;
export type CreateFeedReport = z.infer<typeof createFeedReportSchema>;
export type FeedReportReason = z.infer<typeof feedReportReasonSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type PublicationKind = z.infer<typeof publicationKindSchema>;
export type PublicationCategory = z.infer<typeof publicationCategorySchema>;
export type CreatePublication = z.infer<typeof createPublicationSchema>;
export type PublicationMedia = z.infer<typeof publicationMediaSchema>;
export type Story = z.infer<typeof storySchema>;
export type CreateStory = z.infer<typeof createStorySchema>;
export type StoryViewer = z.infer<typeof storyViewerSchema>;
export type StoryMessage = z.infer<typeof storyMessageSchema>;
export type DirectMessage = z.infer<typeof directMessageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type SendDirectMessage = z.infer<typeof sendDirectMessageSchema>;
export type AppNotification = z.infer<typeof appNotificationSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type LiveSession = z.infer<typeof liveSessionSchema>;
export type LiveComment = z.infer<typeof liveCommentSchema>;
export type LiveCredentials = z.infer<typeof liveCredentialsSchema>;
export type VoteFeedPoll = z.infer<typeof voteFeedPollSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type UpdateUserPreferences = z.infer<typeof updateUserPreferencesSchema>;
