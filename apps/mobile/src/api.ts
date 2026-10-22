import type {
  AuthResponse,
  IndiaRegion,
  LocationPreference,
  LocationProfile,
  LokSabhaConstituency,
  Poll,
  VoteRequest,
  FeedPage,
  FeedPost,
  TrendingFeed,
  FeedComment,
  FeedReportReason,
  FeedMediaKind,
  PublicationCategory,
  PublicationKind,
  Publication,
  Story,
  StoryMessage,
  StoryViewer,
  AppNotification,
  LiveComment,
  LiveSession,
  LiveCredentials,
  ProfileOverview,
  Conversation,
  DirectMessage,
  FeedAuthor,
  SendDirectMessage,
  SearchResults,
  UserPreferences,
  UpdateUserPreferences,
} from "@pulse/contracts";
import { Platform } from "react-native";

declare const process: { env: Record<string, string | undefined> };

// Android emulators reach the host through 10.0.2.2. Physical devices should
// override this with EXPO_PUBLIC_API_URL set to the computer's LAN IP.
const defaultBaseUrl =
  Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://127.0.0.1:4000";
const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? defaultBaseUrl).replace(
  /\/$/,
  "",
);
const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(typeof init?.body === "string"
          ? { "content-type": "application/json" }
          : {}),
        ...init?.headers,
      },
    });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(body?.error ?? "REQUEST_FAILED");
    return body as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("API_REQUEST_TIMED_OUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  preferences: (token: string) =>
    request<UserPreferences>("/v1/me/preferences", {
      headers: { authorization: `Bearer ${token}` },
    }),
  updatePreferences: (input: UpdateUserPreferences, token: string) =>
    request<UserPreferences>("/v1/me/preferences", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    }),
  register: (input: {
    email: string;
    password: string;
    displayName: string;
    username: string;
    otp: string;
    acceptedTerms: true;
  }) =>
    request<AuthResponse>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  usernameAvailability: (input: {
    username?: string;
    displayName?: string;
  }) => {
    const query = new URLSearchParams(
      Object.entries(input).filter((entry): entry is [string, string] =>
        Boolean(entry[1]),
      ),
    ).toString();
    return request<{
      username: string | null;
      available: boolean | null;
      suggestions: string[];
    }>(`/v1/auth/username?${query}`);
  },
  requestEmailOtp: (email: string, purpose: "signup" | "password_reset") =>
    request<{
      sent: boolean;
      expiresInSeconds: number;
      developmentOtp?: string;
    }>("/v1/auth/otp", {
      method: "POST",
      body: JSON.stringify({ email, purpose }),
    }),
  resetPassword: (input: {
    email: string;
    otp: string;
    password: string;
    confirmPassword: string;
  }) =>
    request<void>("/v1/auth/password/reset", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  refresh: (refreshToken: string) =>
    request<AuthResponse>("/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),
  logout: (refreshToken: string) =>
    request<void>("/v1/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),
  featuredPoll: (token: string) =>
    request<Poll>("/v1/polls/featured", {
      headers: { authorization: `Bearer ${token}` },
    }),
  vote: (pollId: string, input: VoteRequest, token: string) =>
    request<Poll>(`/v1/polls/${pollId}/votes`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    }),
  regions: () => request<IndiaRegion[]>("/v1/geography/regions"),
  constituencies: (stateCode: string) =>
    request<LokSabhaConstituency[]>(
      `/v1/geography/regions/${stateCode}/constituencies`,
    ),
  saveLocation: (input: LocationPreference, token: string) =>
    request<LocationProfile>("/v1/me/location", {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    }),
  feed: (token: string, cursor?: string) =>
    request<FeedPage>(
      `/v1/feed?limit=15${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { headers: { authorization: `Bearer ${token}` } },
    ),
  trending: (
    token: string,
    kind: "all" | "posts" | "reels" = "all",
    tag?: string,
  ) =>
    request<TrendingFeed>(
      `/v1/feed/trending?kind=${kind}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`,
      { headers: { authorization: `Bearer ${token}` } },
    ),
  search: (query: string, token: string) =>
    request<SearchResults>(`/v1/feed/search?q=${encodeURIComponent(query)}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  createFeedPost: (
    input: {
      body: string;
      anonymous: boolean;
      media: Array<{
        kind: FeedMediaKind;
        mimeType: string;
        originalName: string;
        sizeBytes: number;
        base64: string;
        durationSeconds?: number | null;
      }>;
      poll?: {
        question: string;
        options: string[];
        allowMultiple: boolean;
        durationMinutes: number;
      } | null;
    },
    token: string,
  ) =>
    request<FeedPost>("/v1/feed/posts", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    }),
  deleteFeedPost: (postId: string, token: string) =>
    request<void>(`/v1/feed/posts/${postId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  likeFeedPost: (postId: string, enabled: boolean, token: string) =>
    request<FeedPost>(`/v1/feed/posts/${postId}/like`, {
      method: enabled ? "PUT" : "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  commentOnFeedPost: (postId: string, body: string, token: string) =>
    request<FeedComment>(`/v1/feed/posts/${postId}/comments`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ body }),
    }),
  replyToFeedComment: (
    postId: string,
    parentCommentId: string,
    body: string,
    token: string,
  ) =>
    request<FeedComment>(`/v1/feed/posts/${postId}/comments`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ body, parentCommentId }),
    }),
  feedComments: (postId: string, token: string) =>
    request<FeedComment[]>(`/v1/feed/posts/${postId}/comments`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  deleteFeedComment: (postId: string, commentId: string, token: string) =>
    request<void>(`/v1/feed/posts/${postId}/comments/${commentId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  repostFeedPost: (postId: string, enabled: boolean, token: string) =>
    request<FeedPost>(`/v1/feed/posts/${postId}/repost`, {
      method: enabled ? "PUT" : "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  mediaUrl: (path: string) => `${baseUrl}${path}`,
  publications: (
    kind: PublicationKind,
    token: string,
    category?: PublicationCategory,
  ) =>
    request<{ items: Publication[] }>(
      `/v1/publications?kind=${kind}${category ? `&category=${category}` : ""}`,
      { headers: { authorization: `Bearer ${token}` } },
    ),
  stories: (token: string) =>
    request<{ items: Story[] }>("/v1/feed/stories", {
      headers: { authorization: `Bearer ${token}` },
    }),
  createStory: (
    input: {
      caption: string;
      isHighlight?: boolean;
      media: {
        kind: "image" | "video";
        mimeType: string;
        originalName: string;
        sizeBytes: number;
        base64: string;
        durationSeconds?: number | null;
      };
    },
    token: string,
  ) =>
    request<Story>("/v1/feed/stories", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    }),
  deleteStory: (storyId: string, token: string) =>
    request<void>(`/v1/feed/stories/${storyId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  profileVideos: (token: string) =>
    request<{ items: FeedPost[] }>("/v1/feed/me/videos", {
      headers: { authorization: `Bearer ${token}` },
    }),
  profile: (token: string, userId?: string) =>
    request<ProfileOverview>(
      userId ? `/v1/feed/users/${userId}/profile` : "/v1/feed/me/profile",
      { headers: { authorization: `Bearer ${token}` } },
    ),
  profileConnections: (
    userId: string,
    kind: "followers" | "following",
    token: string,
  ) =>
    request<{ items: FeedAuthor[] }>(
      `/v1/feed/users/${userId}/connections?kind=${kind}`,
      { headers: { authorization: `Bearer ${token}` } },
    ),
  updateProfile: (
    input: {
      displayName: string;
      username: string;
      bio: string | null;
      website: string | null;
      avatar?: {
        kind: "image" | "video";
        mimeType: string;
        base64: string;
        scale: number;
        offsetX: number;
        offsetY: number;
      };
    },
    token: string,
  ) =>
    request<ProfileOverview>("/v1/feed/me/profile", {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    }),
  requestVerification: (
    input: {
      requestedType: "general" | "grey" | "government" | "media" | "business";
      evidenceUrl: string | null;
      note: string | null;
    },
    token: string,
  ) =>
    request<{ id: string; status: string }>("/v1/verification-requests", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    }),
  verificationStatus: (token: string) =>
    request<{
      status: string;
      verificationType: string | null;
      reviewNote: string | null;
    } | null>("/v1/verification-requests/me", {
      headers: { authorization: `Bearer ${token}` },
    }),
  voteFeedPoll: (postId: string, optionIds: string[], token: string) =>
    request<FeedPost>(`/v1/feed/posts/${postId}/poll-vote`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ optionIds }),
    }),
  viewStory: (storyId: string, token: string) =>
    request<void>(`/v1/feed/stories/${storyId}/view`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
    }),
  likeStory: (storyId: string, enabled: boolean, token: string) =>
    request<void>(`/v1/feed/stories/${storyId}/like`, {
      method: enabled ? "PUT" : "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  replyStory: (storyId: string, body: string, token: string) =>
    request<StoryMessage>(`/v1/feed/stories/${storyId}/replies`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ body }),
    }),
  storyViewers: (storyId: string, token: string) =>
    request<{ items: StoryViewer[] }>(`/v1/feed/stories/${storyId}/viewers`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  storyMessages: (token: string) =>
    request<{ items: StoryMessage[] }>("/v1/feed/story-messages", {
      headers: { authorization: `Bearer ${token}` },
    }),
  conversations: (requested: boolean, token: string) =>
    request<{ items: Conversation[] }>(
      `/v1/chat/conversations?requested=${requested}`,
      { headers: { authorization: `Bearer ${token}` } },
    ),
  chatUsers: (query: string, token: string) =>
    request<{ items: FeedAuthor[] }>(
      `/v1/chat/users?q=${encodeURIComponent(query)}`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    ),
  directMessages: (conversationId: string, token: string) =>
    request<{ items: DirectMessage[] }>(
      `/v1/chat/conversations/${conversationId}/messages`,
      { headers: { authorization: `Bearer ${token}` } },
    ),
  callCredentials: (conversationId: string, token: string) =>
    request<LiveCredentials>(
      `/v1/chat/conversations/${conversationId}/call-credentials`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      },
    ),
  sendDirectMessage: (
    recipientId: string,
    input: Omit<SendDirectMessage, "recipientId">,
    token: string,
  ) =>
    request<DirectMessage>("/v1/chat/messages", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipientId, ...input }),
    }),
  sendConversationMessage: (
    conversationId: string,
    input: Omit<SendDirectMessage, "recipientId">,
    token: string,
  ) =>
    request<DirectMessage>(
      `/v1/chat/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      },
    ),
  acceptMessageRequest: (conversationId: string, token: string) =>
    request<void>(`/v1/chat/conversations/${conversationId}/accept`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
    }),
  declineMessageRequest: (conversationId: string, token: string) =>
    request<void>(`/v1/chat/conversations/${conversationId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  liveSessions: (token: string) =>
    request<{ items: LiveSession[] }>("/v1/feed/live", {
      headers: { authorization: `Bearer ${token}` },
    }),
  startLive: (title: string, token: string) =>
    request<LiveSession>("/v1/feed/live", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ title }),
    }),
  joinLive: (id: string, joined: boolean, token: string) =>
    request<void>(`/v1/feed/live/${id}/join`, {
      method: joined ? "PUT" : "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  endLive: (id: string, token: string) =>
    request<void>(`/v1/feed/live/${id}/end`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
    }),
  liveComments: (id: string, token: string) =>
    request<{ items: LiveComment[] }>(`/v1/feed/live/${id}/comments`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  addLiveComment: (id: string, body: string, token: string) =>
    request<LiveComment>(`/v1/feed/live/${id}/comments`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ body }),
    }),
  notifications: (token: string) =>
    request<{ items: AppNotification[] }>("/v1/feed/notifications", {
      headers: { authorization: `Bearer ${token}` },
    }),
  readNotifications: (token: string, id?: string) =>
    request<void>(
      id ? `/v1/feed/notifications/${id}/read` : "/v1/feed/notifications/read",
      { method: "PUT", headers: { authorization: `Bearer ${token}` } },
    ),
  liveCredentials: (id: string, token: string) =>
    request<LiveCredentials>(`/v1/feed/live/${id}/credentials`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  registerPushToken: (
    pushToken: string,
    platform: "android" | "ios",
    token: string,
  ) =>
    request<void>("/v1/feed/push-token", {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: pushToken, platform }),
    }),
  reportFeedPost: (postId: string, reason: FeedReportReason, token: string) =>
    request<void>(`/v1/feed/posts/${postId}/reports`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason }),
    }),
  followFeedAuthor: (authorId: string, enabled: boolean, token: string) =>
    request<void>(`/v1/feed/users/${authorId}/follow`, {
      method: enabled ? "PUT" : "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  blockFeedAuthor: (authorId: string, token: string) =>
    request<void>(`/v1/feed/users/${authorId}/block`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
    }),
};
