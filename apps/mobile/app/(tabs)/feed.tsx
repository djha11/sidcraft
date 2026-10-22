import { palette } from "../../src/theme";
import { verificationColor, VerifiedName } from "../../src/verified-name";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { mediaFileSize, readMediaAsBase64 } from "../../src/media-file";
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useTracks,
  Track,
} from "../../src/livekit";
import { createVideoPlayer } from "expo-video";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  AppNotification,
  FeedComment,
  FeedMedia,
  FeedMediaKind,
  FeedPost,
  FeedReportReason,
  LiveComment,
  LiveCredentials,
  LiveSession,
  Story,
  StoryViewer,
  TrendingTopic,
} from "@pulse/contracts";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";

export default function Feed() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ startLive?: string }>();
  const handledLiveIntent = useRef(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [attachments, setAttachments] = useState<
    Array<{
      uri: string;
      kind: FeedMediaKind;
      mimeType: string;
      originalName: string;
      sizeBytes: number;
      durationSeconds: number | null;
    }>
  >([]);
  const [commenting, setCommenting] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, FeedComment[]>>({});
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    handle: string;
  } | null>(null);
  const [optionsPost, setOptionsPost] = useState<FeedPost | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [storyReply, setStoryReply] = useState("");
  const [storyViewers, setStoryViewers] = useState<StoryViewer[]>([]);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollDuration, setPollDuration] = useState(1440);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [createStoryOpen, setCreateStoryOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<"story" | "post">("story");
  const [cameraMode, setCameraMode] = useState<"picture" | "video">("picture");
  const [recording, setRecording] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [camera, setCamera] = useState<CameraView | null>(null);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [activeLive, setActiveLive] = useState<LiveSession | null>(null);
  const [liveCredentials, setLiveCredentials] =
    useState<LiveCredentials | null>(null);
  const [liveComments, setLiveComments] = useState<LiveComment[]>([]);
  const [liveComment, setLiveComment] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const load = useCallback(
    async (reset: boolean) => {
      if (!auth.accessToken) return;
      try {
        setError("");
        const [page, storyPage, livePage, notificationPage] = await Promise.all(
          [
            api.feed(
              auth.accessToken,
              reset ? undefined : (cursor ?? undefined),
            ),
            reset
              ? api.stories(auth.accessToken)
              : Promise.resolve({ items: stories }),
            reset
              ? api.liveSessions(auth.accessToken)
              : Promise.resolve({ items: liveSessions }),
            reset
              ? api.notifications(auth.accessToken)
              : Promise.resolve({ items: notifications }),
          ],
        );
        if (reset) setStories(storyPage.items);
        if (reset) {
          setLiveSessions(livePage.items);
          setNotifications(notificationPage.items);
        }
        setPosts((current) =>
          reset
            ? page.items
            : [
                ...current,
                ...page.items.filter(
                  (post) => !current.some((item) => item.id === post.id),
                ),
              ],
        );
        setCursor(page.nextCursor);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "FEED_LOAD_FAILED");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [auth.accessToken, cursor, stories, liveSessions, notifications],
  );

  useEffect(() => {
    void load(true);
  }, [auth.accessToken]);
  useEffect(() => {
    if (
      params.startLive === "1" &&
      auth.accessToken &&
      !handledLiveIntent.current
    ) {
      handledLiveIntent.current = true;
      void startLive();
    }
  }, [params.startLive, auth.accessToken]);
  async function publish() {
    if (
      !auth.accessToken ||
      (!draft.trim() && !attachments.length && !pollOpen)
    )
      return;
    setBusy("publish");
    setError("");
    try {
      const media = await Promise.all(
        attachments.map(async (file) => ({
          ...file,
          base64: await readMediaAsBase64(file.uri),
        })),
      );
      const cleanOptions = pollOptions
        .map((item) => item.trim())
        .filter(Boolean);
      if (pollOpen && (!pollQuestion.trim() || cleanOptions.length < 2)) {
        setError("A poll needs a question and at least two options.");
        setBusy(null);
        return;
      }
      const post = await api.createFeedPost(
        {
          body: draft.trim(),
          anonymous,
          media: media.map(({ uri: _uri, ...item }) => item),
          poll: pollOpen
            ? {
                question: pollQuestion.trim(),
                options: cleanOptions,
                allowMultiple: pollMultiple,
                durationMinutes: pollDuration,
              }
            : null,
        },
        auth.accessToken,
      );
      setPosts((current) => [post, ...current]);
      setDraft("");
      setAttachments([]);
      setAnonymous(false);
      setPollOpen(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollMultiple(false);
      setPollDuration(1440);
      setComposerOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "POST_CREATE_FAILED");
    } finally {
      setBusy(null);
    }
  }
  async function votePoll(post: FeedPost, optionId: string) {
    if (!auth.accessToken || !post.poll) return;
    const current = post.poll.options
      .filter((option) => option.viewerSelected)
      .map((option) => option.id);
    const optionIds = post.poll.allowMultiple
      ? current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
      : [optionId];
    if (!optionIds.length) return;
    try {
      const updated = await api.voteFeedPoll(
        post.id,
        optionIds,
        auth.accessToken,
      );
      setPosts((items) =>
        items.map((item) => (item.id === post.id ? updated : item)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "POLL_VOTE_FAILED");
    }
  }
  function openStory(story: Story) {
    const viewed = { ...story, viewerSeen: true };
    setActiveStory(viewed);
    setStories((items) =>
      items.map((item) => (item.id === story.id ? viewed : item)),
    );
    setStoryReply("");
    setStoryViewers([]);
    if (auth.accessToken)
      void api.viewStory(story.id, auth.accessToken).catch((reason) =>
        setError(
          reason instanceof Error
            ? `Story opened, but the view could not be recorded: ${reason.message}`
            : "Story opened, but the view could not be recorded.",
        ),
      );
  }
  async function toggleStoryLike() {
    if (!activeStory || !auth.accessToken) return;
    try {
      await api.likeStory(activeStory.id, !activeStory.viewerLiked, auth.accessToken);
      const next = { ...activeStory, viewerLiked: !activeStory.viewerLiked };
      setActiveStory(next);
      setStories((items) =>
        items.map((item) => (item.id === next.id ? next : item)),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update story like.");
    }
  }
  async function sendStoryReply() {
    if (!activeStory || !auth.accessToken || !storyReply.trim()) return;
    try {
      await api.replyStory(activeStory.id, storyReply.trim(), auth.accessToken);
      setStoryReply("");
      setError("Reply sent to Chat");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to send story reply.");
    }
  }
  async function loadStoryViewers() {
    if (!activeStory || !auth.accessToken || !activeStory.isOwn) return;
    try {
      const page = await api.storyViewers(activeStory.id, auth.accessToken);
      setStoryViewers(page.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load story viewers.");
    }
  }
  async function addStory() {
    if (!auth.accessToken) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset || (asset.size ?? 1) > 20_000_000) {
      setError("Stories must be 20 MB or smaller");
      return;
    }
    const kind = mediaKind(asset.mimeType);
    if (kind === "document") return;
    const created = await api.createStory(
      {
        caption: "",
        media: {
          kind,
          mimeType: asset.mimeType ?? "application/octet-stream",
          originalName: asset.name,
          sizeBytes: asset.size ?? 1,
          base64: await readMediaAsBase64(asset.uri),
        },
      },
      auth.accessToken,
    );
    setStories((current) => [
      created,
      ...current.filter((item) => item.id !== created.id),
    ]);
    setCreateStoryOpen(false);
  }
  async function openCamera(target: "story" | "post" = "story") {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setError("Camera permission is required");
        return;
      }
    }
    setCameraTarget(target);
    if (target === "story") setCreateStoryOpen(false);
    setCameraOpen(true);
  }
  async function saveCameraStory(uri: string, kind: "image" | "video") {
    if (!auth.accessToken) return;
    const base64 = await readMediaAsBase64(uri);
    const created = await api.createStory(
      {
        caption: "",
        media: {
          kind,
          mimeType: kind === "image" ? "image/jpeg" : "video/mp4",
          originalName: `story-${Date.now()}.${kind === "image" ? "jpg" : "mp4"}`,
          sizeBytes: Math.ceil(base64.length * 0.75),
          base64,
          durationSeconds: kind === "video" ? 180 : null,
        },
      },
      auth.accessToken,
    );
    setStories((items) => [created, ...items]);
    setCameraOpen(false);
    setRecording(false);
  }
  async function saveCameraPost(uri: string, kind: "image" | "video") {
    const sizeBytes = await mediaFileSize(uri);
    const durationSeconds =
      kind === "video" ? await readVideoDuration(uri).catch(() => null) : null;
    setAttachments((items) =>
      [
        ...items,
        {
          uri,
          kind,
          mimeType: kind === "image" ? "image/jpeg" : "video/mp4",
          originalName: `camera-${Date.now()}.${kind === "image" ? "jpg" : "mp4"}`,
          sizeBytes,
          durationSeconds,
        },
      ].slice(0, 4),
    );
    setCameraOpen(false);
    setRecording(false);
  }
  async function captureStory() {
    if (!camera) return;
    if (cameraMode === "picture") {
      const result = await camera.takePictureAsync({ quality: 0.7 });
      if (result?.uri)
        await (cameraTarget === "post"
          ? saveCameraPost(result.uri, "image")
          : saveCameraStory(result.uri, "image"));
      return;
    }
    if (recording) {
      camera.stopRecording();
      return;
    }
    setRecording(true);
    const result = await camera.recordAsync({ maxDuration: 180 });
    if (result?.uri)
      await (cameraTarget === "post"
        ? saveCameraPost(result.uri, "video")
        : saveCameraStory(result.uri, "video"));
  }
  async function startLive() {
    if (!auth.accessToken) return;
    try {
      if (!cameraPermission?.granted) {
        const permission = await requestCameraPermission();
        if (!permission.granted) {
          setError("Camera permission is required to go live.");
          return;
        }
      }
      const microphonePermission = await requestRecordingPermissionsAsync();
      if (!microphonePermission.granted) {
        setError("Microphone permission is required to go live.");
        return;
      }
      const live = await api.startLive("Live now", auth.accessToken);
      const credentials = await api.liveCredentials(live.id, auth.accessToken);
      setLiveSessions((items) => [
        live,
        ...items.filter((item) => item.host.id !== live.host.id),
      ]);
      setLiveCredentials(credentials);
      setActiveLive(live);
      setCreateStoryOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to start live video.");
    }
  }
  async function openLive(live: LiveSession) {
    if (!auth.accessToken) return;
    setError("");
    try {
      const credentials = await api.liveCredentials(live.id, auth.accessToken);
      await api.joinLive(live.id, true, auth.accessToken);
      const page = await api.liveComments(live.id, auth.accessToken);
      setLiveCredentials(credentials);
      setLiveComments(page.items);
      setActiveLive(live);
    } catch (reason) {
      setLiveCredentials(null);
      setActiveLive(null);
      setError(
        reason instanceof Error
          ? `Unable to open live: ${reason.message}`
          : "Unable to open live right now.",
      );
    }
  }
  async function closeLive() {
    if (!activeLive) return;
    const live = activeLive;
    const token = auth.accessToken;
    setLiveSessions((items) =>
      items.filter((item) => item.id !== live.id),
    );
    setActiveLive(null);
    setLiveCredentials(null);
    setLiveComments([]);
    setLiveComment("");

    if (!token) return;
    try {
      if (live.isOwn) await api.endLive(live.id, token);
      else await api.joinLive(live.id, false, token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update live status.");
    }
  }
  async function sendLiveComment() {
    if (!activeLive || !auth.accessToken || !liveComment.trim()) return;
    const created = await api.addLiveComment(
      activeLive.id,
      liveComment.trim(),
      auth.accessToken,
    );
    setLiveComments((items) => [...items, created]);
    setLiveComment("");
  }
  async function pickAttachments() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "image/*",
        "video/*",
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const selected = await Promise.all(
      result.assets.slice(0, 4 - attachments.length).map(async (asset) => {
        const kind = mediaKind(asset.mimeType);
        const durationSeconds =
          kind === "video"
            ? await readVideoDuration(asset.uri).catch(() => null)
            : null;
        if (kind === "video" && !durationSeconds)
          setError(
            `Could not read the duration of ${asset.name}. Please choose the video again.`,
          );
        return {
          uri: asset.uri,
          originalName: asset.name,
          mimeType: asset.mimeType ?? "application/octet-stream",
          sizeBytes: asset.size ?? 1,
          kind,
          durationSeconds,
        };
      }),
    );
    const tooLarge = selected.find((file) => file.sizeBytes > 20_000_000);
    if (tooLarge) {
      setError(`${tooLarge.originalName} is larger than 20 MB`);
      return;
    }
    if (selected.some((file) => file.kind === "video" && !file.durationSeconds))
      return;
    setAttachments((current) => [...current, ...selected].slice(0, 4));
  }
  async function toggleLike(post: FeedPost) {
    if (!auth.accessToken) return;
    setBusy(`like:${post.id}`);
    try {
      const updated = await api.likeFeedPost(
        post.id,
        !post.viewerLiked,
        auth.accessToken,
      );
      setPosts((current) =>
        current.map((item) => (item.id === post.id ? updated : item)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "LIKE_FAILED");
    } finally {
      setBusy(null);
    }
  }
  async function submitComment(post: FeedPost) {
    if (!auth.accessToken || !comment.trim()) return;
    setBusy(`comment:${post.id}`);
    try {
      const created = replyingTo
        ? await api.replyToFeedComment(
            post.id,
            replyingTo.id,
            comment.trim(),
            auth.accessToken,
          )
        : await api.commentOnFeedPost(
            post.id,
            comment.trim(),
            auth.accessToken,
          );
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id
            ? {
                ...item,
                commentCount: item.commentCount + 1,
                recentComments: replyingTo
                  ? item.recentComments
                  : [...item.recentComments, created].slice(-2),
              }
            : item,
        ),
      );
      setComment("");
      setReplyingTo(null);
      const updatedThread = await api.feedComments(post.id, auth.accessToken);
      setThreads((current) => ({ ...current, [post.id]: updatedThread }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "COMMENT_FAILED");
    } finally {
      setBusy(null);
    }
  }
  async function openComments(post: FeedPost) {
    setCommenting(commenting === post.id ? null : post.id);
    setReplyingTo(null);
    setComment("");
    if (commenting !== post.id && auth.accessToken)
      (setThreads((current) => ({
        ...current,
        [post.id]: current[post.id] ?? [],
      })),
        api
          .feedComments(post.id, auth.accessToken)
          .then((items) =>
            setThreads((current) => ({ ...current, [post.id]: items })),
          )
          .catch(() => setError("COMMENTS_LOAD_FAILED")));
  }
  function confirmDeleteComment(
    postId: string,
    commentId: string,
    removedCount: number,
  ) {
    if (!auth.accessToken) return;
    Alert.alert(
      "Delete comment?",
      "Your comment will be permanently removed.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteFeedComment(postId, commentId, auth.accessToken!);
              setThreads((current) => ({
                ...current,
                [postId]: (current[postId] ?? [])
                  .filter((entry) => entry.id !== commentId)
                  .map((entry) => ({
                    ...entry,
                    replies: entry.replies.filter(
                      (reply) => reply.id !== commentId,
                    ),
                  })),
              }));
              setPosts((current) =>
                current.map((post) =>
                  post.id === postId
                    ? {
                        ...post,
                        commentCount: Math.max(
                          0,
                          post.commentCount - removedCount,
                        ),
                        recentComments: post.recentComments.filter(
                          (entry) => entry.id !== commentId,
                        ),
                      }
                    : post,
                ),
              );
            } catch {
              setError("COMMENT_DELETE_FAILED");
            }
          },
        },
      ],
    );
  }
  async function toggleRepost(post: FeedPost) {
    if (!auth.accessToken) return;
    try {
      const updated = await api.repostFeedPost(
        post.id,
        !post.viewerReposted,
        auth.accessToken,
      );
      setPosts((current) =>
        current.map((item) => (item.id === post.id ? updated : item)),
      );
    } catch {
      setError("REPOST_FAILED");
    }
  }
  async function toggleFollow(post: FeedPost) {
    if (!auth.accessToken || !post.author) return;
    setBusy(`follow:${post.author.id}`);
    try {
      await api.followFeedAuthor(
        post.author.id,
        !post.viewerFollowsAuthor,
        auth.accessToken,
      );
      setPosts((current) =>
        current.map((item) =>
          item.author?.id === post.author?.id
            ? { ...item, viewerFollowsAuthor: !post.viewerFollowsAuthor }
            : item,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "FOLLOW_FAILED");
    } finally {
      setBusy(null);
    }
  }
  function moderate(post: FeedPost) {
    setOptionsPost(post);
  }
  function deleteOwnPost() {
    if (!auth.accessToken || !optionsPost?.isOwn) return;
    const id = optionsPost.id;
    Alert.alert(
      "Delete post?",
      "This post will be permanently removed everywhere.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, delete",
          style: "destructive",
          onPress: () => {
            setOptionsPost(null);
            void api
              .deleteFeedPost(id, auth.accessToken!)
              .then(() =>
                setPosts((current) => current.filter((item) => item.id !== id)),
              )
              .catch(() => setError("DELETE_FAILED"));
          },
        },
      ],
    );
  }
  function reportPost(reason: FeedReportReason) {
    if (!auth.accessToken || !optionsPost) return;
    const id = optionsPost.id;
    setOptionsPost(null);
    void api
      .reportFeedPost(id, reason, auth.accessToken)
      .then(() =>
        setPosts((current) => current.filter((item) => item.id !== id)),
      )
      .catch(() => setError("REPORT_FAILED"));
  }
  function blockPostAuthor() {
    if (!auth.accessToken || !optionsPost?.author) return;
    const authorId = optionsPost.author.id;
    setOptionsPost(null);
    void api
      .blockFeedAuthor(authorId, auth.accessToken)
      .then(() =>
        setPosts((current) =>
          current.filter((item) => item.author?.id !== authorId),
        ),
      )
      .catch(() => setError("BLOCK_FAILED"));
  }
  const commentingPost = posts.find((post) => post.id === commenting) ?? null;
  const storyGroups = useMemo(() => {
    const groups = new Map<string, Story[]>();
    for (const story of stories)
      groups.set(story.author.id, [
        ...(groups.get(story.author.id) ?? []),
        story,
      ]);
    return [...groups.values()].map((items) => ({
      id: items[0]!.author.id,
      kind: "story-group" as const,
      items,
      story: items.find((item) => !item.viewerSeen) ?? items[0]!,
      hasUnseen: items.some((item) => !item.viewerSeen),
      isOwn: items[0]!.isOwn,
    }));
  }, [stories]);
  const hasOwnStory = storyGroups.some((group) => group.isOwn);

  // Authentication refreshes can change the token between renders. This
  // redirect must stay below every hook so React always sees the same order.
  if (!auth.loading && !auth.accessToken) return <Redirect href="/login" />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        style={styles.feedList}
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.page}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.accent}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.brand}>● SidCraft</Text>
              <View style={styles.headerActions}>
                <View style={styles.feedPill}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.heading}>For you</Text>
                </View>
                <Pressable
                  accessibilityLabel="Notifications"
                  onPress={() => setNotificationsOpen(true)}
                  style={styles.bell}
                >
                  <Ionicons
                    name={
                      notifications.some((item) => !item.readAt)
                        ? "notifications"
                        : "notifications-outline"
                    }
                    size={21}
                    color={palette.text}
                  />
                  {notifications.some((item) => !item.readAt) ? (
                    <View style={styles.notificationDot} />
                  ) : null}
                </Pressable>
              </View>
            </View>
            <FlatList
              horizontal
              data={[
                ...(!hasOwnStory ? [{ id: "add", kind: "add" as const }] : []),
                ...liveSessions.map((item) => ({
                  ...item,
                  kind: "live" as const,
                })),
                ...storyGroups,
              ]}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storyTray}
              renderItem={({ item }) =>
                item.kind === "add" ? (
                  <Pressable
                    onPress={() => setCreateStoryOpen(true)}
                    style={styles.storyItem}
                  >
                    <View style={styles.storyAdd}>
                      <Text style={styles.storyPlus}>＋</Text>
                    </View>
                    <Text style={styles.storyName}>Your story</Text>
                  </Pressable>
                ) : item.kind === "live" ? (
                  <Pressable
                    onPress={() => void openLive(item)}
                    style={styles.storyItem}
                  >
                    <View style={styles.liveRing}>
                      <Text style={styles.storyAvatar}>
                        {item.host.displayName.slice(0, 1).toUpperCase()}
                      </Text>
                      <Text style={styles.liveBadge}>LIVE</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.storyName}>
                      {item.isOwn ? "Your live" : item.host.displayName}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => openStory(item.story)}
                    style={styles.storyItem}
                  >
                    <View
                      style={[
                        styles.storyRing,
                        !item.hasUnseen && styles.storyRingSeen,
                      ]}
                    >
                      <Text style={styles.storyAvatar}>
                        {item.story.author.displayName
                          .slice(0, 1)
                          .toUpperCase()}
                      </Text>
                      {item.isOwn ? (
                        <Pressable
                          accessibilityLabel="Add another story"
                          onPress={() => setCreateStoryOpen(true)}
                          style={styles.storyAddBadge}
                        >
                          <Ionicons
                            name="add"
                            size={14}
                            color={palette.onAccent}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                    <Text numberOfLines={1} style={styles.storyName}>
                      {item.isOwn
                        ? "Your story"
                        : item.story.author.displayName}
                    </Text>
                  </Pressable>
                )
              }
            />
            <TrendingStrip />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.post}>
            <View style={styles.postLayout}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.author
                    ? item.author.displayName.slice(0, 1).toUpperCase()
                    : "?"}
                </Text>
              </View>
              <View style={styles.postContent}>
                <View style={styles.authorRow}>
                  <View style={{ flex: 1 }}>
                    <VerifiedName
                      name={item.author?.displayName ?? "Anonymous"}
                      type={item.author?.verificationType}
                      textStyle={styles.name}
                    />
                    <Text style={styles.handle}>
                      {item.author
                        ? `@${item.author.handle}`
                        : "Identity protected"}{" "}
                      · {relativeTime(item.createdAt)}
                    </Text>
                  </View>
                  {!item.isOwn && item.author ? (
                    <Pressable
                      disabled={busy === `follow:${item.author.id}`}
                      onPress={() => toggleFollow(item)}
                      style={styles.follow}
                    >
                      <Text style={styles.followText}>
                        {item.viewerFollowsAuthor ? "Following" : "Follow"}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityLabel="Post options"
                    onPress={() => moderate(item)}
                  >
                    <Text style={styles.more}>•••</Text>
                  </Pressable>
                </View>
                {item.body ? (
                  <Text style={styles.body}>{item.body}</Text>
                ) : null}
                {item.media.length ? (
                  <MediaCarousel media={item.media} />
                ) : null}
                {item.poll ? (
                  <PollCard
                    post={item}
                    onVote={(optionId) => void votePoll(item, optionId)}
                  />
                ) : null}
                <View style={styles.actions}>
                  <Pressable
                    accessibilityLabel="Like post"
                    onPress={() => toggleLike(item)}
                    style={styles.actionButton}
                  >
                    <Ionicons
                      name={item.viewerLiked ? "heart" : "heart-outline"}
                      size={18}
                      color={item.viewerLiked ? "#ff4f70" : palette.muted}
                    />
                    <Text
                      style={[
                        styles.actionCount,
                        item.viewerLiked && styles.liked,
                      ]}
                    >
                      {item.likeCount}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Open comments"
                    onPress={() => void openComments(item)}
                    style={styles.actionButton}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={18}
                      color={palette.muted}
                    />
                    <Text style={styles.actionCount}>{item.commentCount}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Repost"
                    onPress={() => void toggleRepost(item)}
                    style={[
                      styles.actionButton,
                      item.viewerReposted && styles.actionActive,
                    ]}
                  >
                    <Ionicons
                      name="repeat"
                      size={18}
                      color={item.viewerReposted ? "#61dfb0" : palette.muted}
                    />
                    <Text
                      style={[
                        styles.actionCount,
                        item.viewerReposted && styles.reposted,
                      ]}
                    >
                      {item.repostCount}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Share post"
                    onPress={() =>
                      void Share.share({
                        message: `${item.body || "Shared post"}\n${item.media.map((m) => api.mediaUrl(m.url)).join("\n")}`,
                      })
                    }
                    style={styles.actionButton}
                  >
                    <Ionicons
                      name="share-social-outline"
                      size={18}
                      color={palette.muted}
                    />
                  </Pressable>
                </View>
                {item.commentCount ? (
                  <Pressable onPress={() => void openComments(item)}>
                    <Text style={styles.viewComments}>
                      View all {item.commentCount}{" "}
                      {item.commentCount === 1 ? "comment" : "comments"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              color={palette.accent}
              style={{ marginTop: 40 }}
            />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Your feed starts here.</Text>
              <Text style={styles.emptyBody}>
                Publish the first post or follow people as they appear.
              </Text>
            </View>
          )
        }
        onEndReached={() => {
          if (cursor && !loading) void load(false);
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          cursor ? (
            <ActivityIndicator color={palette.accent} style={{ margin: 20 }} />
          ) : null
        }
      />
      <Pressable
        accessibilityLabel="Create post"
        onPress={() => setComposerOpen(true)}
        style={styles.fab}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>
      <Modal
        visible={composerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setComposerOpen(false)}
      >
        <Pressable
          style={styles.composerBackdrop}
          onPress={() => setComposerOpen(false)}
        >
          <Pressable
            style={styles.composerSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.composerHeader}>
              <Text style={styles.composerTitle}>Create post</Text>
              <Pressable onPress={() => setComposerOpen(false)}>
                <Text style={styles.commentsClose}>×</Text>
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="Create a post"
              autoFocus
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={1000}
              placeholder="Share something with your network…"
              placeholderTextColor={palette.muted}
              style={styles.composerInput}
            />
            {attachments.length ? (
              <View style={styles.attachmentStrip}>
                {attachments.map((file, index) => (
                  <View
                    key={`${file.uri}:${index}`}
                    style={styles.attachmentTile}
                  >
                    {file.kind === "image" ? (
                      <Image
                        source={{ uri: file.uri }}
                        style={styles.attachmentPreview}
                        resizeMode="cover"
                      />
                    ) : file.kind === "video" ? (
                      <View
                        style={[styles.attachmentPreview, styles.videoPreview]}
                      >
                        <Ionicons
                          name="videocam"
                          size={20}
                          color={palette.text}
                        />
                        <View style={styles.playBadge}>
                          <Ionicons
                            name="play"
                            size={11}
                            color={palette.onAccent}
                          />
                        </View>
                      </View>
                    ) : (
                      <View
                        style={[
                          styles.attachmentPreview,
                          styles.documentPreview,
                        ]}
                      >
                        <Ionicons
                          name="document-text-outline"
                          size={24}
                          color={palette.accent}
                        />
                      </View>
                    )}
                    <Pressable
                      accessibilityLabel={`Remove selected ${file.kind}`}
                      onPress={() =>
                        setAttachments((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                      style={styles.attachmentRemove}
                    >
                      <Ionicons name="close" size={13} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {attachments.some((file) => file.kind === "video") ? (
              <Text style={styles.privacyNote}>
                {attachments.some(
                  (file) =>
                    file.kind === "video" && (file.durationSeconds ?? 0) > 180,
                )
                  ? "Videos over 3 minutes stay in Feed and Profile Videos only."
                  : "Videos up to 3 minutes also appear in Reels."}
              </Text>
            ) : null}
            {pollOpen ? (
              <View style={styles.pollComposer}>
                <TextInput
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                  placeholder="Ask a question"
                  placeholderTextColor={palette.muted}
                  style={styles.pollQuestion}
                />
                {pollOptions.map((option, index) => (
                  <View key={index} style={styles.pollOptionRow}>
                    <TextInput
                      value={option}
                      onChangeText={(value) =>
                        setPollOptions((items) =>
                          items.map((item, i) => (i === index ? value : item)),
                        )
                      }
                      placeholder={`Option ${index + 1}`}
                      placeholderTextColor={palette.muted}
                      style={styles.pollOptionInput}
                    />
                    {pollOptions.length > 2 ? (
                      <Pressable
                        onPress={() =>
                          setPollOptions((items) =>
                            items.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Text style={styles.remove}>×</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {pollOptions.length < 6 ? (
                  <Pressable
                    onPress={() => setPollOptions((items) => [...items, ""])}
                  >
                    <Text style={styles.tool}>＋ Add option</Text>
                  </Pressable>
                ) : null}
                <View style={styles.pollSettings}>
                  <Pressable onPress={() => setPollMultiple((value) => !value)}>
                    <Text style={styles.tool}>
                      {pollMultiple ? "✓ Multiple answers" : "Single answer"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      setPollDuration((value) =>
                        value === 60 ? 1440 : value === 1440 ? 10080 : 60,
                      )
                    }
                  >
                    <Text style={styles.tool}>
                      {pollDuration === 60
                        ? "1 hour"
                        : pollDuration === 1440
                          ? "24 hours"
                          : "7 days"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <View style={styles.composerActions}>
              <View style={styles.composerPrimaryActions}>
                <Pressable
                  accessibilityLabel="Choose media or file"
                  disabled={attachments.length >= 4}
                  onPress={() => void pickAttachments()}
                  style={[
                    styles.composerAction,
                    attachments.length >= 4 && styles.disabled,
                  ]}
                >
                  <Ionicons
                    name="images-outline"
                    size={19}
                    color={palette.accent}
                  />
                  <Text style={styles.composerActionText}>Media</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Open camera"
                  disabled={attachments.length >= 4}
                  onPress={() => void openCamera("post")}
                  style={[
                    styles.composerAction,
                    attachments.length >= 4 && styles.disabled,
                  ]}
                >
                  <Ionicons
                    name="camera-outline"
                    size={20}
                    color={palette.accent}
                  />
                  <Text style={styles.composerActionText}>Camera</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={pollOpen ? "Remove poll" : "Create poll"}
                  onPress={() => setPollOpen((value) => !value)}
                  style={[
                    styles.composerAction,
                    pollOpen && styles.composerActionSelected,
                  ]}
                >
                  <Ionicons
                    name={
                      pollOpen ? "close-circle-outline" : "stats-chart-outline"
                    }
                    size={19}
                    color={palette.accent}
                  />
                  <Text style={styles.composerActionText}>
                    {pollOpen ? "Remove" : "Poll"}
                  </Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel="Post anonymously"
                onPress={() => setAnonymous((value) => !value)}
                style={[
                  styles.anonymousRow,
                  anonymous && styles.anonymousRowActive,
                ]}
              >
                <View
                  style={[
                    styles.anonymousIcon,
                    anonymous && styles.anonymousIconActive,
                  ]}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={18}
                    color={anonymous ? palette.text : palette.accent}
                  />
                </View>
                <View style={styles.anonymousCopy}>
                  <Text style={styles.anonymousTitle}>Post anonymously</Text>
                  <Text style={styles.anonymousHint}>
                    Your identity stays hidden
                  </Text>
                </View>
                <View
                  style={[
                    styles.toggleTrack,
                    anonymous && styles.toggleTrackActive,
                  ]}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      anonymous && styles.toggleThumbActive,
                    ]}
                  />
                </View>
              </Pressable>
            </View>
            {anonymous ? (
              <Text style={styles.privacyNote}>
                Your identity is hidden from everyone viewing this post.
              </Text>
            ) : null}
            <View style={styles.composerBottom}>
              <Text style={styles.count}>{draft.length}/1000</Text>
              <Pressable
                accessibilityRole="button"
                disabled={
                  (!draft.trim() && !attachments.length && !pollOpen) ||
                  busy === "publish"
                }
                onPress={publish}
                style={[
                  styles.publish,
                  ((!draft.trim() && !attachments.length && !pollOpen) ||
                    busy === "publish") &&
                    styles.disabled,
                ]}
              >
                {busy === "publish" ? (
                  <ActivityIndicator color={palette.onAccent} />
                ) : (
                  <Text style={styles.publishText}>Post</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={createStoryOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateStoryOpen(false)}
      >
        <Pressable
          style={styles.composerBackdrop}
          onPress={() => setCreateStoryOpen(false)}
        >
          <View style={styles.creationMenu}>
            <Text style={styles.composerTitle}>Create</Text>
            <Pressable
              onPress={() => void openCamera()}
              style={styles.creationOption}
            >
              <Text style={styles.creationIcon}>◎</Text>
              <View>
                <Text style={styles.creationTitle}>Camera</Text>
                <Text style={styles.creationHint}>
                  Take a photo or record video
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => void addStory()}
              style={styles.creationOption}
            >
              <Text style={styles.creationIcon}>▧</Text>
              <View>
                <Text style={styles.creationTitle}>Media</Text>
                <Text style={styles.creationHint}>Choose a photo or video</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => void startLive()}
              style={styles.creationOption}
            >
              <Text style={[styles.creationIcon, { color: "#ff416c" }]}>●</Text>
              <View>
                <Text style={styles.creationTitle}>Go Live</Text>
                <Text style={styles.creationHint}>
                  Followers receive a notification
                </Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      <Modal
        visible={cameraOpen}
        animationType="fade"
        onRequestClose={() => setCameraOpen(false)}
      >
        <View style={styles.cameraScreen}>
          <CameraView
            ref={(value) => setCamera(value)}
            style={StyleSheet.absoluteFill}
            mode={cameraMode}
            facing="back"
          />
          <View style={styles.cameraHeader}>
            <Pressable onPress={() => setCameraOpen(false)}>
              <Text style={styles.storyClose}>×</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                setCameraMode((value) =>
                  value === "picture" ? "video" : "picture",
                )
              }
            >
              <Text style={styles.cameraMode}>
                {cameraMode === "picture" ? "PHOTO" : "VIDEO"}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityLabel={
              recording ? "Stop recording" : `Capture ${cameraMode}`
            }
            onPress={() => void captureStory()}
            style={[styles.shutter, recording && styles.shutterRecording]}
          />
        </View>
      </Modal>
      <Modal
        visible={!!activeLive}
        animationType="fade"
        onRequestClose={() => void closeLive()}
      >
        <View style={styles.liveScreen}>
          {activeLive && liveCredentials ? (
            <LiveMedia
              credentials={liveCredentials}
              isHost={activeLive.isOwn}
            />
          ) : (
            <ActivityIndicator color={palette.accent} style={{ flex: 1 }} />
          )}
          <View style={styles.liveHeader}>
            <Text style={styles.liveHeaderBadge}>LIVE</Text>
            <Text style={styles.liveHost}>
              @{activeLive?.host.handle} · {activeLive?.viewerCount ?? 0}{" "}
              watching
            </Text>
            <Pressable
              accessibilityLabel={activeLive?.isOwn ? "End live" : "Close live"}
              accessibilityRole="button"
              hitSlop={16}
              onPress={() => void closeLive()}
            >
              <Text style={styles.storyClose}>×</Text>
            </Pressable>
          </View>
          <View style={styles.floatingComments}>
            {liveComments.slice(-6).map((entry) => (
              <Text key={entry.id} style={styles.floatingComment}>
                <Text style={styles.commentAuthor}>
                  @{entry.author.handle}{" "}
                </Text>
                {entry.body}
              </Text>
            ))}
          </View>
          <View style={styles.liveComposer}>
            <TextInput
              value={liveComment}
              onChangeText={setLiveComment}
              maxLength={300}
              placeholder="Comment…"
              placeholderTextColor={palette.muted}
              style={styles.liveInput}
            />
            <Pressable onPress={() => void sendLiveComment()}>
              <Text style={styles.storySend}>Send</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={notificationsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <Pressable
          style={styles.commentsBackdrop}
          onPress={() => setNotificationsOpen(false)}
        >
          <Pressable
            style={styles.notificationsSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.notificationHeader}>
              <View>
                <Text style={styles.notificationEyebrow}>YOUR ACTIVITY</Text>
                <Text style={styles.notificationsTitle}>Notifications</Text>
              </View>
              <Pressable
                onPress={() => {
                  if (auth.accessToken)
                    void api.readNotifications(auth.accessToken);
                  setNotifications((items) =>
                    items.map((item) => ({
                      ...item,
                      readAt: item.readAt ?? new Date().toISOString(),
                    })),
                  );
                }}
                style={styles.markRead}
              >
                <Ionicons
                  name="checkmark-done"
                  size={17}
                  color={palette.accent}
                />
                <Text style={styles.markReadText}>Read all</Text>
              </Pressable>
            </View>
            <FlatList
              contentContainerStyle={styles.notificationList}
              data={notifications}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.notificationEmpty}>
                  <Ionicons
                    name="notifications-off-outline"
                    size={36}
                    color={palette.muted}
                  />
                  <Text style={styles.noComments}>You’re all caught up.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    if (auth.accessToken)
                      void api.readNotifications(auth.accessToken, item.id);
                    setNotifications((items) =>
                      items.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, readAt: new Date().toISOString() }
                          : entry,
                      ),
                    );
                    const live = item.liveSessionId
                      ? liveSessions.find(
                          (entry) => entry.id === item.liveSessionId,
                        )
                      : null;
                    if (live) {
                      setNotificationsOpen(false);
                      void openLive(live);
                    }
                  }}
                  style={[
                    styles.notificationRow,
                    !item.readAt && styles.notificationUnread,
                  ]}
                >
                  <View style={styles.notificationAvatar}>
                    <Text style={styles.avatarText}>
                      {item.actor?.displayName.slice(0, 1) ?? "P"}
                    </Text>
                    <View style={styles.notificationTypeBadge}>
                      <Ionicons
                        name={notificationIcon(item.type)}
                        size={11}
                        color={palette.onAccent}
                      />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notificationMessage}>
                      {item.message}
                    </Text>
                    <Text style={styles.notificationTime}>
                      {relativeTime(item.createdAt)} ago
                    </Text>
                  </View>
                  {!item.readAt ? <View style={styles.unreadDot} /> : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={!!activeStory}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveStory(null)}
      >
        <View style={styles.storyViewer}>
          {activeStory ? (
            <>
              {activeStory.media.kind === "image" ? (
                <Image
                  source={{ uri: api.mediaUrl(activeStory.media.url) }}
                  style={styles.storyMedia}
                  resizeMode="contain"
                />
              ) : (
                <Pressable
                  style={styles.storyVideo}
                  onPress={() =>
                    void Linking.openURL(api.mediaUrl(activeStory.media.url))
                  }
                >
                  <Text style={styles.storyVideoPlay}>▶</Text>
                  <Text style={styles.storyViewerName}>
                    Tap to play story video
                  </Text>
                </Pressable>
              )}
              <View style={styles.storyViewerHeader}>
                <View style={styles.storyRingSmall}>
                  <Text style={styles.storyAvatar}>
                    {activeStory.author.displayName.slice(0, 1)}
                  </Text>
                </View>
                <VerifiedName
                  name={activeStory.author.displayName}
                  type={activeStory.author.verificationType}
                  textStyle={styles.storyViewerName}
                />
                {activeStory.isOwn ? (
                  <Pressable
                    accessibilityLabel="Story options"
                    onPress={() =>
                      Alert.alert(
                        "Delete story?",
                        "This story will be permanently removed.",
                        [
                          { text: "No", style: "cancel" },
                          {
                            text: "Yes, delete",
                            style: "destructive",
                            onPress: async () => {
                              if (!auth.accessToken) return;
                              const storyId = activeStory.id;
                              setActiveStory(null);
                              setStories((items) =>
                                items.filter((item) => item.id !== storyId),
                              );
                              try {
                                await api.deleteStory(storyId, auth.accessToken);
                              } catch (reason) {
                                setError(
                                  reason instanceof Error
                                    ? `Story closed, but deletion failed: ${reason.message}`
                                    : "Story closed, but deletion failed.",
                                );
                              }
                            },
                          },
                        ],
                      )
                    }
                  >
                    <Ionicons
                      name="ellipsis-horizontal"
                      size={25}
                      color="#fff"
                    />
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setActiveStory(null)}>
                  <Text style={styles.storyClose}>×</Text>
                </Pressable>
              </View>
              {activeStory.caption ? (
                <Text style={styles.storyCaption}>{activeStory.caption}</Text>
              ) : null}
              <View style={styles.storySocial}>
                {activeStory.isOwn ? (
                  <Pressable onPress={() => void loadStoryViewers()}>
                    <Text style={styles.storySocialText}>
                      ◉ {activeStory.viewerCount} viewers
                    </Text>
                  </Pressable>
                ) : (
                  <>
                    <TextInput
                      value={storyReply}
                      onChangeText={setStoryReply}
                      placeholder="Reply to story…"
                      placeholderTextColor={palette.muted}
                      style={styles.storyReplyInput}
                    />
                    <Pressable onPress={() => void sendStoryReply()}>
                      <Text style={styles.storySend}>Send</Text>
                    </Pressable>
                    <Pressable onPress={() => void toggleStoryLike()}>
                      <Text
                        style={[
                          styles.storyHeart,
                          activeStory.viewerLiked && styles.liked,
                        ]}
                      >
                        {activeStory.viewerLiked ? "♥" : "♡"}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
              {storyViewers.length ? (
                <View style={styles.viewerPanel}>
                  <Text style={styles.viewerTitle}>Seen by</Text>
                  {storyViewers.map((viewer) => (
                    <Text key={viewer.user.id} style={styles.viewerRow}>
                      @{viewer.user.handle}
                      {viewer.liked ? "  ♥" : ""}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </Modal>
      <Modal
        visible={Boolean(commentingPost)}
        transparent
        animationType="slide"
        onRequestClose={() => setCommenting(null)}
      >
        <Pressable
          style={styles.commentsBackdrop}
          onPress={() => setCommenting(null)}
        >
          <Pressable
            style={styles.commentsSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.commentsHeader}>
              <Text style={styles.commentsTitle}>Comments</Text>
              <Pressable
                accessibilityLabel="Close comments"
                onPress={() => setCommenting(null)}
              >
                <Text style={styles.commentsClose}>×</Text>
              </Pressable>
            </View>
            <FlatList
              data={commenting ? (threads[commenting] ?? []) : []}
              keyExtractor={(entry) => entry.id}
              contentContainerStyle={styles.commentsList}
              ListEmptyComponent={
                <Text style={styles.noComments}>
                  No comments yet. Start the conversation.
                </Text>
              }
              renderItem={({ item: entry }) => (
                <View style={styles.threadItem}>
                  <View style={styles.commentMenuRow}>
                    <Text style={styles.comment}>
                      <Text style={styles.commentAuthor}>
                        @{entry.author.handle}{" "}
                        {entry.author.verificationType ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={13}
                            color={verificationColor(
                              entry.author.verificationType,
                            )}
                          />
                        ) : null}{" "}
                      </Text>
                      {entry.body}
                    </Text>
                    {entry.isOwn ? (
                      <Pressable
                        accessibilityLabel="Comment options"
                        onPress={() =>
                          confirmDeleteComment(
                            commenting!,
                            entry.id,
                            1 + entry.replies.length,
                          )
                        }
                      >
                        <Ionicons
                          name="ellipsis-horizontal"
                          size={20}
                          color={palette.muted}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => {
                      setReplyingTo({
                        id: entry.id,
                        handle: entry.author.handle,
                      });
                      setComment("");
                    }}
                  >
                    <Text style={styles.replyButton}>Reply</Text>
                  </Pressable>
                  {entry.replies.map((reply) => (
                    <View key={reply.id} style={styles.replyMenuRow}>
                      <Text style={styles.reply}>
                        <Text style={styles.commentAuthor}>
                          @{reply.author.handle}{" "}
                          {reply.author.verificationType ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={12}
                              color={verificationColor(
                                reply.author.verificationType,
                              )}
                            />
                          ) : null}{" "}
                        </Text>
                        {reply.body}
                      </Text>
                      {reply.isOwn ? (
                        <Pressable
                          accessibilityLabel="Reply options"
                          onPress={() =>
                            confirmDeleteComment(commenting!, reply.id, 1)
                          }
                        >
                          <Ionicons
                            name="ellipsis-horizontal"
                            size={18}
                            color={palette.muted}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            />
            {commentingPost ? (
              <View style={styles.commentComposer}>
                {replyingTo ? (
                  <View style={styles.replyingBanner}>
                    <Text style={styles.replyingText}>
                      Replying to @{replyingTo.handle}
                    </Text>
                    <Pressable onPress={() => setReplyingTo(null)}>
                      <Text style={styles.cancelReply}>×</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.commentRow}>
                  <TextInput
                    value={comment}
                    onChangeText={setComment}
                    maxLength={500}
                    placeholder={
                      replyingTo ? "Write a reply…" : "Add a comment…"
                    }
                    placeholderTextColor={palette.muted}
                    style={styles.commentInput}
                  />
                  <Pressable
                    disabled={
                      !comment.trim() || busy === `comment:${commentingPost.id}`
                    }
                    onPress={() => submitComment(commentingPost)}
                  >
                    <Text style={styles.send}>Post</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={Boolean(optionsPost)}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsPost(null)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close post options"
          style={styles.overlay}
          onPress={() => setOptionsPost(null)}
        >
          <Pressable
            accessibilityRole="menu"
            style={styles.optionSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.optionTitle}>Post options</Text>
            {optionsPost?.isOwn ? (
              <>
                <Text style={styles.optionInfo}>
                  Only you can delete content you created.
                </Text>
                <Pressable onPress={deleteOwnPost} style={styles.optionButton}>
                  <Text style={styles.dangerText}>Delete post</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.optionInfo}>
                  Reports are private. Tap outside this panel to close it.
                </Text>
                <Pressable
                  onPress={() => reportPost("spam")}
                  style={styles.optionButton}
                >
                  <Text style={styles.optionText}>Report spam</Text>
                </Pressable>
                <Pressable
                  onPress={() => reportPost("harassment")}
                  style={styles.optionButton}
                >
                  <Text style={styles.optionText}>Report harassment</Text>
                </Pressable>
                {optionsPost?.author ? (
                  <Pressable
                    onPress={blockPostAuthor}
                    style={styles.optionButton}
                  >
                    <Text style={styles.dangerText}>Block author</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.optionInfo}>
                    Anonymous authors cannot be identified or blocked. You can
                    still report this post.
                  </Text>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function TrendingStrip() {
  const auth = useAuth();
  const router = useRouter();
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [itemCount, setItemCount] = useState(0);
  useEffect(() => {
    if (!auth.accessToken) return;
    api
      .trending(auth.accessToken)
      .then((result) => {
        setTopics(result.topics.slice(0, 6));
        setItemCount(result.items.length);
      })
      .catch(() => {
        setTopics([]);
        setItemCount(0);
      });
  }, [auth.accessToken]);
  return (
    <View style={styles.trendingStrip}>
      <View style={styles.trendingHeadingRow}>
        <Text style={styles.trendingTitle}>Trending on SidCraft</Text>
        <Pressable onPress={() => router.push("/trending")} hitSlop={10}>
          <Text style={styles.trendingSeeAll}>See all</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={
          topics.length
            ? topics
            : [
                {
                  tag: "Trending now",
                  postCount: itemCount,
                  reelCount: 0,
                  score: 0,
                },
              ]
        }
        keyExtractor={(item) => item.tag.toLocaleLowerCase()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.trendingTopics}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() =>
              item.tag === "Trending now"
                ? router.push("/trending")
                : router.push({
                    pathname: "/trending",
                    params: { tag: item.tag },
                  })
            }
            style={styles.trendingChip}
          >
            <Text style={styles.trendingRank}>{index + 1}</Text>
            <View>
              <Text style={styles.trendingTag}>{item.tag}</Text>
              <Text style={styles.trendingCount}>{item.postCount} posts</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function LiveMedia({
  credentials,
  isHost,
}: {
  credentials: LiveCredentials;
  isHost: boolean;
}) {
  useEffect(() => {
    void AudioSession.startAudioSession();
    return () => {
      void AudioSession.stopAudioSession();
    };
  }, []);
  return (
    <LiveKitRoom
      serverUrl={credentials.serverUrl}
      token={credentials.token}
      connect
      audio={isHost}
      video={isHost}
      options={{ adaptiveStream: true, dynacast: true }}
    >
      <LiveVideoSurface />
    </LiveKitRoom>
  );
}
function LiveVideoSurface() {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const track = tracks.find(isTrackReference);
  return track ? (
    <VideoTrack trackRef={track} style={styles.liveVideoSurface} />
  ) : (
    <View style={styles.liveRemote}>
      <Text style={styles.liveRemoteIcon}>LIVE</Text>
      <Text style={styles.liveRemoteText}>Connecting secure video…</Text>
    </View>
  );
}
function MediaCarousel({ media }: { media: FeedMedia[] }) {
  const [page, setPage] = useState(0);
  const width = Math.min(Dimensions.get("window").width - 86, 570);
  return (
    <View style={styles.carousel}>
      <FlatList
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        data={media}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(event) =>
          setPage(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item }) => (
          <View style={[styles.mediaPage, { width }]}>
            {item.kind === "image" ? (
              <Image
                source={{ uri: api.mediaUrl(item.url) }}
                style={styles.postImage}
                resizeMode="cover"
              />
            ) : (
              <Pressable
                onPress={() => void Linking.openURL(api.mediaUrl(item.url))}
                style={styles.fileCard}
              >
                <Text style={styles.fileIcon}>
                  {item.kind === "video" ? "▶" : "▤"}
                </Text>
                <Text numberOfLines={2} style={styles.fileName}>
                  {item.originalName}
                </Text>
                <Text style={styles.fileMeta}>
                  {item.kind.toUpperCase()} · {formatBytes(item.sizeBytes)} ·
                  Tap to open
                </Text>
              </Pressable>
            )}
          </View>
        )}
      />
      {media.length > 1 ? (
        <>
          <View style={styles.mediaCounter}>
            <Text style={styles.mediaCounterText}>
              {page + 1}/{media.length}
            </Text>
          </View>
          <View style={styles.dots}>
            {media.map((item, index) => (
              <View
                key={item.id}
                style={[styles.dot, index === page && styles.dotActive]}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function PollCard({
  post,
  onVote,
}: {
  post: FeedPost;
  onVote: (optionId: string) => void;
}) {
  const poll = post.poll!;
  const hasVoted = poll.options.some((option) => option.viewerSelected);
  return (
    <View style={styles.pollCard}>
      <Text style={styles.pollTitle}>{poll.question}</Text>
      {poll.options.map((option) => (
        <Pressable
          key={option.id}
          disabled={poll.isClosed}
          onPress={() => onVote(option.id)}
          style={[
            styles.pollChoice,
            option.viewerSelected && styles.pollSelected,
          ]}
        >
          <View
            style={[
              styles.pollFill,
              {
                width: `${hasVoted || poll.isClosed ? option.percentage : 0}%`,
              },
            ]}
          />
          <Text style={styles.pollChoiceLabel}>
            {option.viewerSelected ? "✓ " : ""}
            {option.label}
          </Text>
          {hasVoted || poll.isClosed ? (
            <Text style={styles.pollPercent}>{option.percentage}%</Text>
          ) : null}
        </Pressable>
      ))}
      <Text style={styles.pollMeta}>
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"} ·{" "}
        {poll.isClosed
          ? "Final results"
          : poll.allowMultiple
            ? "Choose multiple"
            : "Choose one"}{" "}
        · ends {relativeTimeFuture(poll.closesAt)}
      </Text>
    </View>
  );
}

function mediaKind(mimeType?: string | null): FeedMediaKind {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  return "document";
}

function readVideoDuration(uri: string) {
  return new Promise<number>((resolve, reject) => {
    const player = createVideoPlayer(uri);
    let settled = false;
    const finish = (value?: number) => {
      if (settled) return;
      settled = true;
      subscription.remove();
      player.release();
      value && value > 0
        ? resolve(Math.ceil(value))
        : reject(new Error("VIDEO_DURATION_UNAVAILABLE"));
    };
    const subscription = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") finish(player.duration);
      if (status === "error") finish();
    });
    setTimeout(() => finish(player.duration), 8_000);
  });
}
function formatBytes(value: number) {
  return value < 1_000_000
    ? `${Math.ceil(value / 1000)} KB`
    : `${(value / 1_000_000).toFixed(1)} MB`;
}

function relativeTime(value: string) {
  const seconds = Math.max(
    1,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
function relativeTimeFuture(value: string) {
  const minutes = Math.max(
    0,
    Math.ceil((new Date(value).getTime() - Date.now()) / 60_000),
  );
  return minutes < 60
    ? `in ${minutes}m`
    : minutes < 1440
      ? `in ${Math.ceil(minutes / 60)}h`
      : `in ${Math.ceil(minutes / 1440)}d`;
}
function notificationIcon(
  type: AppNotification["type"],
): keyof typeof Ionicons.glyphMap {
  return type === "post_like"
    ? "heart"
    : type === "post_comment"
      ? "chatbubble"
      : type === "live_started"
        ? "radio"
        : type === "mention"
          ? "at"
          : "person-add";
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  feedList: {
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
    ...Platform.select({
      web: {
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: palette.borderSoft,
      },
      default: {},
    }),
  },
  trendingStrip: {
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: palette.borderSoft,
  },
  trendingHeadingRow: {
    paddingHorizontal: 2,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trendingTitle: { color: palette.text, fontSize: 17, fontWeight: "800" },
  trendingSeeAll: { color: palette.accent, fontSize: 13, fontWeight: "800" },
  trendingTopics: { gap: 9, paddingRight: 10 },
  trendingChip: {
    minWidth: 142,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: palette.surfaceStrong,
  },
  trendingRank: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  trendingTag: { color: palette.text, fontSize: 14, fontWeight: "800" },
  trendingCount: { color: palette.muted, fontSize: 10, marginTop: 2 },
  page: { paddingBottom: 36 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 60,
    paddingHorizontal: 16,
  },
  brand: { color: palette.text, fontSize: 20, fontWeight: "900" },
  heading: { color: palette.text, fontWeight: "800", fontSize: 12 },
  feedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.surfaceStrong,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.accent,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationDot: {
    position: "absolute",
    right: 7,
    top: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.border,
    backgroundColor: "#ff416c",
  },
  composer: {
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
  },
  composerInput: {
    color: palette.text,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: "top",
  },
  composerBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  composerTools: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 10,
  },
  composerActions: { gap: 10, marginTop: 12, marginBottom: 10 },
  composerPrimaryActions: { flexDirection: "row", gap: 8 },
  composerAction: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: palette.surfaceStrong,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  composerActionSelected: {
    borderColor: "#8ebc35",
    backgroundColor: palette.surface,
  },
  composerActionText: { color: palette.text, fontSize: 12, fontWeight: "800" },
  anonymousRow: {
    minHeight: 58,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: palette.surface,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  anonymousRowActive: {
    borderColor: "#8ebc35",
    backgroundColor: palette.surface,
  },
  anonymousIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.borderSoft,
  },
  anonymousIconActive: { backgroundColor: palette.accent },
  anonymousCopy: { flex: 1 },
  anonymousTitle: { color: palette.text, fontSize: 13, fontWeight: "800" },
  anonymousHint: { color: palette.muted, fontSize: 10, marginTop: 2 },
  toggleTrack: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.borderSoft,
    padding: 3,
  },
  toggleTrackActive: { backgroundColor: palette.accent },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.surfaceStrong,
  },
  toggleThumbActive: {
    transform: [{ translateX: 16 }],
    backgroundColor: palette.surfaceStrong,
  },
  tool: { color: palette.accent, fontWeight: "800", fontSize: 12 },
  anonToggle: {
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  anonActive: { backgroundColor: palette.surface, borderColor: palette.accent },
  anonText: { color: palette.text, fontSize: 12, fontWeight: "800" },
  privacyNote: { color: palette.muted, fontSize: 11, marginBottom: 10 },
  attachmentStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 10,
    marginBottom: 4,
  },
  attachmentTile: {
    width: 68,
    height: 68,
    borderRadius: 10,
    overflow: "visible",
  },
  attachmentPreview: {
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: palette.surface,
  },
  videoPreview: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  documentPreview: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  playBadge: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accent,
  },
  attachmentRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff4f70",
    borderWidth: 2,
    borderColor: palette.border,
  },
  remove: { color: "#ff8066", fontSize: 20, paddingLeft: 8 },
  count: { color: palette.muted, fontSize: 10 },
  publish: {
    backgroundColor: palette.accent,
    height: 38,
    minWidth: 76,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  publishText: { color: palette.onAccent, fontWeight: "900" },
  disabled: { opacity: 0.35 },
  error: { color: "#ff8066", marginHorizontal: 16, marginBottom: 12 },
  storyTray: { gap: 14, paddingHorizontal: 16, paddingBottom: 14 },
  storyItem: { width: 72, alignItems: "center" },
  storyAdd: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: palette.borderSoft,
    backgroundColor: palette.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  storyPlus: { color: palette.accent, fontSize: 28, fontWeight: "800" },
  storyRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: palette.accent,
    backgroundColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  storyRingSeen: { borderColor: palette.borderSoft },
  storyAddBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.accent,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  liveRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: "#ff416c",
    backgroundColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  liveBadge: {
    position: "absolute",
    bottom: -5,
    backgroundColor: "#ff174d",
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  storyRingSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: palette.accent,
    backgroundColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  storyAvatar: { color: "#fff", fontWeight: "900", fontSize: 18 },
  storyName: {
    color: "#b7bdc7",
    fontSize: 10,
    marginTop: 6,
    width: 72,
    textAlign: "center",
  },
  storyViewer: {
    flex: 1,
    backgroundColor: palette.mediaBackground,
    justifyContent: "center",
  },
  storyMedia: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  storyVideo: { flex: 1, alignItems: "center", justifyContent: "center" },
  storyVideoPlay: { color: palette.accent, fontSize: 58, marginBottom: 12 },
  storyViewerHeader: {
    position: "absolute",
    top: 48,
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  storyViewerName: { color: "#fff", fontWeight: "900", flex: 1 },
  storyClose: { color: "#fff", fontSize: 30 },
  storyCaption: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 70,
    color: "#fff",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
  storySocial: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  storyReplyInput: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderColor: palette.muted,
    borderRadius: 23,
    color: "#fff",
    paddingHorizontal: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  storySend: { color: palette.accent, fontWeight: "900" },
  storyHeart: { color: "#fff", fontSize: 32 },
  storySocialText: { color: "#fff", fontWeight: "900" },
  viewerPanel: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 76,
    maxHeight: 260,
    backgroundColor: "rgba(17,21,28,0.96)",
    borderRadius: 18,
    padding: 16,
  },
  viewerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 8,
  },
  viewerRow: { color: palette.text, paddingVertical: 7 },
  pollComposer: {
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 14,
    padding: 10,
    marginTop: 10,
    gap: 7,
  },
  pollQuestion: { color: palette.text, fontWeight: "800", minHeight: 42 },
  pollOptionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pollOptionInput: {
    flex: 1,
    height: 40,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  pollSettings: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  pollCard: { marginBottom: 14, gap: 8 },
  pollTitle: { color: palette.text, fontSize: 17, fontWeight: "900" },
  pollChoice: {
    height: 46,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
  },
  pollSelected: { borderColor: palette.accent },
  pollFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(202,255,85,0.18)",
  },
  pollChoiceLabel: { color: palette.text, fontWeight: "700", flex: 1 },
  pollPercent: { color: palette.accent, fontWeight: "900" },
  pollMeta: { color: palette.muted, fontSize: 10, marginTop: 3 },
  post: {
    backgroundColor: palette.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 13,
  },
  postLayout: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  postContent: { flex: 1, minWidth: 0 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: palette.accent, fontWeight: "900" },
  name: { color: palette.text, fontWeight: "800" },
  handle: { color: palette.muted, fontSize: 11, marginTop: 2 },
  follow: {
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  followText: { color: palette.accent, fontSize: 11, fontWeight: "800" },
  more: { color: palette.muted, paddingLeft: 8 },
  body: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 7,
    marginBottom: 10,
  },
  carousel: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 6,
    marginBottom: 10,
  },
  mediaPage: { height: 300, backgroundColor: palette.background },
  postImage: { width: "100%", height: 300, backgroundColor: palette.surface },
  fileCard: {
    height: 300,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 14,
    padding: 24,
  },
  fileIcon: { color: palette.accent, fontSize: 22 },
  fileName: { color: palette.text, fontWeight: "800", textAlign: "center" },
  fileMeta: { color: palette.muted, fontSize: 10, marginTop: 3 },
  mediaCounter: {
    position: "absolute",
    right: 10,
    top: 10,
    backgroundColor: "rgba(0,0,0,0.68)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mediaCounterText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.38)",
  },
  dotActive: { width: 16, backgroundColor: palette.accent },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 7,
    marginTop: 2,
  },
  actionButton: {
    minWidth: 44,
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
  },
  actionActive: {},
  actionCount: { color: palette.muted, fontWeight: "600", fontSize: 11 },
  actionLabel: { color: palette.muted, fontWeight: "700", fontSize: 11 },
  liked: { color: "#ff6685" },
  reposted: { color: "#7ee2b8" },
  comment: { color: "#b5bbc5", fontSize: 13, lineHeight: 19, marginTop: 9 },
  commentAuthor: { color: palette.text, fontWeight: "800" },
  replyButton: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
  commentMenuRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  replyMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 4,
  },
  reply: {
    color: "#b5bbc5",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
    marginLeft: 20,
    borderLeftWidth: 2,
    borderLeftColor: palette.borderSoft,
    paddingLeft: 10,
  },
  cancelReply: { color: palette.muted, fontSize: 22 },
  commentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  commentInput: {
    flex: 1,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 12,
    height: 42,
    paddingHorizontal: 12,
  },
  send: { color: palette.accent, fontWeight: "900" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: {
    color: palette.text,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "700",
  },
  composerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  creationMenu: {
    backgroundColor: palette.surfaceStrong,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    gap: 8,
  },
  creationOption: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSoft,
  },
  creationIcon: {
    color: palette.accent,
    fontSize: 29,
    width: 38,
    textAlign: "center",
  },
  creationTitle: { color: palette.text, fontSize: 16, fontWeight: "900" },
  creationHint: { color: palette.muted, marginTop: 3 },
  cameraScreen: { flex: 1, backgroundColor: "#000" },
  cameraHeader: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cameraMode: {
    color: "#fff",
    fontWeight: "900",
    backgroundColor: "rgba(0,0,0,0.55)",
    padding: 10,
    borderRadius: 16,
  },
  shutter: {
    position: "absolute",
    bottom: 48,
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#fff",
    borderWidth: 7,
    borderColor: "rgba(255,255,255,0.45)",
  },
  shutterRecording: { backgroundColor: "#ff174d", borderRadius: 16 },
  liveScreen: { flex: 1, backgroundColor: palette.mediaBackground },
  liveVideoSurface: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  liveRemote: { flex: 1, alignItems: "center", justifyContent: "center" },
  liveRemoteIcon: {
    color: "#fff",
    backgroundColor: "#ff174d",
    fontWeight: "900",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 7,
  },
  liveRemoteText: { color: palette.muted, marginTop: 12 },
  liveHeader: {
    position: "absolute",
    top: 50,
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  liveHeaderBadge: {
    color: "#fff",
    backgroundColor: "#ff174d",
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
  },
  liveHost: { flex: 1, color: "#fff", fontWeight: "800" },
  floatingComments: {
    position: "absolute",
    left: 16,
    right: 70,
    bottom: 105,
    gap: 8,
  },
  floatingComment: {
    alignSelf: "flex-start",
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 15,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  liveComposer: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  liveInput: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.muted,
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
  },
  notificationsSheet: {
    height: "80%",
    backgroundColor: palette.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    paddingTop: 10,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  notificationEyebrow: {
    color: palette.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.7,
  },
  notificationsTitle: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 24,
    marginTop: 3,
  },
  markRead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: "rgba(191,255,70,0.07)",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 13,
  },
  markReadText: { color: palette.accent, fontSize: 11, fontWeight: "900" },
  notificationList: { paddingHorizontal: 12, paddingBottom: 30 },
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 14,
    marginBottom: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.surface,
    backgroundColor: palette.surfaceStrong,
  },
  notificationUnread: {
    backgroundColor: "rgba(191,255,70,0.055)",
    borderColor: "rgba(191,255,70,0.2)",
  },
  notificationAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationTypeBadge: {
    position: "absolute",
    right: -3,
    bottom: -2,
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accent,
    borderWidth: 2,
    borderColor: palette.border,
  },
  notificationMessage: {
    color: palette.text,
    fontWeight: "700",
    lineHeight: 19,
  },
  notificationTime: { color: palette.muted, fontSize: 11, marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.accent,
  },
  notificationEmpty: { alignItems: "center", gap: 10, paddingTop: 70 },
  composerSheet: {
    backgroundColor: palette.surfaceStrong,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    padding: 18,
    paddingBottom: 28,
  },
  composerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  composerTitle: { color: palette.text, fontSize: 20, fontWeight: "900" },
  viewComments: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
    paddingVertical: 3,
  },
  commentsBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  commentsSheet: {
    height: "76%",
    backgroundColor: palette.surfaceStrong,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#4b5360",
    alignSelf: "center",
    marginBottom: 8,
  },
  commentsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSoft,
  },
  commentsTitle: { color: palette.text, fontSize: 18, fontWeight: "900" },
  commentsClose: { color: palette.muted, fontSize: 28 },
  commentsList: { padding: 16, flexGrow: 1 },
  noComments: { color: palette.muted, textAlign: "center", marginTop: 50 },
  threadItem: {
    paddingBottom: 14,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.text,
  },
  commentComposer: {
    borderTopWidth: 1,
    borderTopColor: palette.borderSoft,
    padding: 12,
    paddingBottom: 20,
  },
  replyingBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  replyingText: { color: palette.muted, fontSize: 11 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    justifyContent: "flex-end",
    padding: 16,
  },
  optionSheet: {
    backgroundColor: palette.surfaceStrong,
    borderColor: palette.borderSoft,
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    marginBottom: 18,
  },
  optionTitle: { color: palette.text, fontSize: 19, fontWeight: "900" },
  optionInfo: {
    color: palette.muted,
    lineHeight: 18,
    marginTop: 7,
    marginBottom: 8,
  },
  optionButton: {
    minHeight: 48,
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: "#292f39",
  },
  optionText: { color: "#66b6ff", fontWeight: "800" },
  dangerText: { color: "#ff8066", fontWeight: "800" },
  empty: { padding: 28, alignItems: "center" },
  emptyTitle: { color: palette.text, fontSize: 22, fontWeight: "900" },
  emptyBody: {
    color: palette.muted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
});
