import { palette } from "../../src/theme";
import { verificationColor, VerifiedName } from "../../src/verified-name";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { mediaFileSize, readMediaAsBase64 } from "../../src/media-file";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import Constants from "expo-constants";
import type {
  FeedComment,
  Publication,
  PublicationCategory,
  PublicationKind,
} from "@pulse/contracts";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";

const categories: Array<{ label: string; value?: PublicationCategory }> = [
  { label: "For You" },
  { label: "Politics", value: "politics" },
  { label: "Sports", value: "sports" },
  { label: "Entertainment", value: "entertainment" },
  { label: "Business", value: "business" },
  { label: "Stocks", value: "stocks" },
  { label: "Tech", value: "tech" },
  { label: "India", value: "india" },
  { label: "World", value: "world" },
];

export default function NewsAndReels() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<PublicationKind>("news");
  const [category, setCategory] = useState<PublicationCategory | undefined>();
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [height, setHeight] = useState(600);
  const [composerOpen, setComposerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [camera, setCamera] = useState<CameraView | null>(null);
  const [recording, setRecording] = useState(false);
  const [caption, setCaption] = useState("");
  const [video, setVideo] = useState<{
    uri: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const load = useCallback(async () => {
    if (!auth.accessToken) return;
    setLoading(true);
    setError("");
    try {
      const page = await api.publications(
        mode,
        auth.accessToken,
        mode === "news" ? category : undefined,
      );
      setItems(page.items);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "CONTENT_LOAD_FAILED",
      );
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, mode, category]);
  useEffect(() => {
    void load();
  }, [load]);
  async function chooseVideo() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "video/*",
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if ((asset.size ?? 1) > 20_000_000) {
      Alert.alert("Video too large", "Choose a video up to 20 MB.");
      return;
    }
    setVideo({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "video/mp4",
      sizeBytes: asset.size ?? 1,
    });
    setComposerOpen(true);
  }
  async function openCamera() {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) return;
    }
    setComposerOpen(false);
    setCameraOpen(true);
  }
  async function captureVideo() {
    if (!camera) return;
    if (recording) {
      camera.stopRecording();
      return;
    }
    setRecording(true);
    const result = await camera.recordAsync({ maxDuration: 180 });
    setRecording(false);
    setCameraOpen(false);
    if (!result?.uri) return;
    const sizeBytes = await mediaFileSize(result.uri);
    setVideo({
      uri: result.uri,
      name: `reel-${Date.now()}.mp4`,
      mimeType: "video/mp4",
      sizeBytes,
    });
    setComposerOpen(true);
  }
  async function publishReel() {
    if (!auth.accessToken || !video || !caption.trim()) return;
    setPublishing(true);
    try {
      const base64 = await readMediaAsBase64(video.uri);
      await api.createFeedPost(
        {
          body: caption.trim(),
          anonymous: false,
          media: [
            {
              kind: "video",
              mimeType: video.mimeType,
              originalName: video.name,
              sizeBytes: video.sizeBytes,
              base64,
              durationSeconds: 180,
            },
          ],
          poll: null,
        },
        auth.accessToken,
      );
      setCaption("");
      setVideo(null);
      setComposerOpen(false);
      setMode("reel");
      await load();
    } finally {
      setPublishing(false);
    }
  }
  if (!auth.loading && !auth.accessToken) return <Redirect href="/login" />;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View
        pointerEvents="box-none"
        style={[
          styles.header,
          mode === "reel" && styles.reelHeader,
          mode === "reel" && { top: insets.top + 6 },
        ]}
      >
        {mode === "news" ? <Text style={styles.brand}>● SidCraft</Text> : null}
        {mode === "reel" ? (
          <Pressable
            accessibilityLabel="Create reel"
            onPress={() => setComposerOpen(true)}
            style={styles.createReel}
          >
            <Ionicons name="add" size={26} color="#fff" />
          </Pressable>
        ) : null}
        <View pointerEvents="box-none" style={styles.modeDock}>
          <View style={styles.modeBar}>
            <Pressable
              onPress={() => setMode("news")}
              style={[styles.modeButton, mode === "news" && styles.modeActive]}
            >
              <Text
                style={[
                  styles.modeText,
                  mode === "news" && styles.modeTextActive,
                ]}
              >
                News
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("reel")}
              style={[styles.modeButton, mode === "reel" && styles.modeActive]}
            >
              <Text
                style={[
                  styles.modeText,
                  mode === "reel" && styles.modeTextActive,
                ]}
              >
                Reels
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      {mode === "news" ? (
        <FlatList
          horizontal
          style={styles.categoryList}
          data={categories}
          keyExtractor={(item) => item.label}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categories}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setCategory(item.value)}
              style={[
                styles.chip,
                category === item.value && styles.activeChip,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  category === item.value && styles.activeText,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          )}
        />
      ) : null}
      <View
        style={styles.deck}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      >
        {loading ? (
          <ActivityIndicator color={palette.accent} style={styles.center} />
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          </View>
        ) : items.length ? (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            pagingEnabled
            decelerationRate="fast"
            disableIntervalMomentum
            snapToAlignment="start"
            showsVerticalScrollIndicator={false}
            snapToInterval={height}
            snapToOffsets={items.map((_, index) => height * index)}
            style={styles.verticalPager}
            getItemLayout={(_, index) => ({
              length: height,
              offset: height * index,
              index,
            })}
            renderItem={({ item }) =>
              mode === "news" ? (
                <NewsCard item={item} height={height} />
              ) : (
                <ReelCard
                  item={item}
                  height={height}
                  token={auth.accessToken!}
                  onChanged={load}
                />
              )
            }
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No {mode} published yet</Text>
            <Text style={styles.emptyText}>
              New content published by the SidCraft admin studio will appear
              here.
            </Text>
          </View>
        )}
      </View>
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
            style={styles.reelComposer}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.composerHeading}>
              <Text style={styles.composerTitle}>Create reel</Text>
              <Pressable onPress={() => setComposerOpen(false)}>
                <Ionicons name="close" size={25} color={palette.text} />
              </Pressable>
            </View>
            {video ? (
              <View style={styles.selectedVideo}>
                <Ionicons name="videocam" size={24} color={palette.accent} />
                <Text numberOfLines={1} style={styles.selectedVideoName}>
                  {video.name}
                </Text>
                <Pressable onPress={() => setVideo(null)}>
                  <Ionicons name="trash-outline" size={20} color="#ff8066" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.sourceRow}>
                <Pressable
                  onPress={() => void openCamera()}
                  style={styles.sourceButton}
                >
                  <Ionicons
                    name="camera-outline"
                    size={24}
                    color={palette.accent}
                  />
                  <Text style={styles.sourceButtonText}>Camera</Text>
                </Pressable>
                <Pressable
                  onPress={() => void chooseVideo()}
                  style={styles.sourceButton}
                >
                  <Ionicons
                    name="images-outline"
                    size={24}
                    color={palette.accent}
                  />
                  <Text style={styles.sourceButtonText}>Media</Text>
                </Pressable>
              </View>
            )}
            <TextInput
              value={caption}
              onChangeText={setCaption}
              maxLength={280}
              multiline
              placeholder="Write a tagline…"
              placeholderTextColor={palette.muted}
              style={styles.captionInput}
            />
            <Pressable
              disabled={!video || !caption.trim() || publishing}
              onPress={() => void publishReel()}
              style={[
                styles.publishReel,
                (!video || !caption.trim() || publishing) && styles.disabled,
              ]}
            >
              {publishing ? (
                <ActivityIndicator color={palette.onAccent} />
              ) : (
                <Text style={styles.publishReelText}>Share reel</Text>
              )}
            </Pressable>
          </Pressable>
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
            mode="video"
            facing="back"
          />
          <View style={styles.cameraTop}>
            <Pressable onPress={() => setCameraOpen(false)}>
              <Ionicons name="close" size={30} color="#fff" />
            </Pressable>
            <Text style={styles.cameraTitle}>New reel</Text>
            <View style={{ width: 30 }} />
          </View>
          <Pressable
            accessibilityLabel={recording ? "Stop recording" : "Record reel"}
            onPress={() => void captureVideo()}
            style={[styles.shutter, recording && styles.shutterRecording]}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function NewsCard({ item, height }: { item: Publication; height: number }) {
  return (
    <View style={[styles.newsCard, { height }]}>
      <PublicationGallery item={item} />
      <View style={styles.newsContent}>
        <View style={styles.newsMeta}>
          <Text style={styles.topic}>{item.category.toUpperCase()}</Text>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>{item.sourceName}</Text>
          </View>
        </View>
        <Text style={styles.headline}>{item.headline}</Text>
        <Text numberOfLines={8} style={styles.summary}>
          {item.summary}
        </Text>
        {item.evidenceNote ? (
          <View style={styles.evidence}>
            <Text style={styles.evidenceLabel}>SOURCE EVIDENCE</Text>
            <Text numberOfLines={2} style={styles.evidenceText}>
              {item.evidenceNote}
            </Text>
          </View>
        ) : null}
        <View style={styles.newsActions}>
          <Pressable
            onPress={() => void Linking.openURL(item.sourceUrl)}
            style={styles.readSource}
          >
            <Text style={styles.readSourceText}>Read original ↗</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Share article"
            onPress={() =>
              void Share.share({
                message: `${item.headline}\n${item.sourceUrl}`,
              })
            }
            style={styles.shareButton}
          >
            <Text style={styles.shareIcon}>↗</Text>
          </Pressable>
          <Text style={styles.swipe}>SWIPE ↑</Text>
        </View>
      </View>
    </View>
  );
}

function PublicationGallery({ item }: { item: Publication }) {
  const media = item.media?.length
    ? item.media
    : [{ url: item.mediaUrl, kind: "image" as const }];
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(Dimensions.get("window").width);
  return (
    <View
      style={styles.newsGallery}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <FlatList
        horizontal
        pagingEnabled
        nestedScrollEnabled
        data={media}
        keyExtractor={(entry, index) => `${entry.url}:${index}`}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setPage(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item: entry }) => (
          <View style={{ width, height: "100%" }}>
            {entry.kind === "video" ? (
              <NewsVideo
                uri={
                  entry.url.startsWith("/")
                    ? api.mediaUrl(entry.url)
                    : entry.url
                }
              />
            ) : (
              <Image
                source={{
                  uri: entry.url.startsWith("/")
                    ? api.mediaUrl(entry.url)
                    : entry.url,
                }}
                style={styles.newsImage}
                resizeMode="cover"
              />
            )}
          </View>
        )}
      />
      {media.length > 1 ? (
        <>
          <View style={styles.galleryCount}>
            <Text style={styles.galleryCountText}>
              {page + 1}/{media.length}
            </Text>
          </View>
          <View style={styles.galleryDots}>
            {media.map((entry, index) => (
              <View
                key={`${entry.url}:dot`}
                style={[
                  styles.galleryDot,
                  index === page && styles.galleryDotActive,
                ]}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function NewsVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.newsImage}
      contentFit="cover"
      nativeControls
    />
  );
}

function ReelCard({
  item,
  height,
  token,
  onChanged,
}: {
  item: Publication;
  height: number;
  token: string;
  onChanged: () => Promise<void>;
}) {
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const mediaUrl = item.mediaUrl.startsWith("/")
    ? api.mediaUrl(item.mediaUrl)
    : item.mediaUrl;
  const player = useVideoPlayer(mediaUrl, (instance) => {
    instance.loop = true;
    instance.play();
  });
  const expoGo = Constants.executionEnvironment === "storeClient";
  async function toggleLike() {
    if (!item.feedPostId) {
      setLiked((value) => !value);
      setLikeCount((value) => Math.max(0, value + (liked ? -1 : 1)));
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikeCount((value) => Math.max(0, value + (next ? 1 : -1)));
    try {
      await api.likeFeedPost(item.feedPostId, next, token);
    } catch {
      setLiked(!next);
    }
  }
  async function toggleRepost() {
    const next = !reposted;
    setReposted(next);
    if (item.feedPostId)
      try {
        await api.repostFeedPost(item.feedPostId, next, token);
      } catch {
        setReposted(!next);
      }
  }
  async function toggleFollow() {
    if (!item.author) return;
    const next = !following;
    setFollowing(next);
    try {
      await api.followFeedAuthor(item.author.id, next, token);
      await onChanged();
    } catch {
      setFollowing(!next);
    }
  }
  async function openComments() {
    if (!item.feedPostId) {
      Alert.alert("Comments", "Comments are unavailable for publisher reels.");
      return;
    }
    setCommentsOpen(true);
    setComments(await api.feedComments(item.feedPostId, token));
  }
  async function sendComment() {
    if (!item.feedPostId || !commentBody.trim()) return;
    await api.commentOnFeedPost(item.feedPostId, commentBody.trim(), token);
    setCommentBody("");
    setComments(await api.feedComments(item.feedPostId, token));
  }
  function openOptions() {
    if (!item.feedPostId) {
      Alert.alert(
        "Reel options",
        "Publisher reels are managed by the publishing team.",
      );
      return;
    }
    if (item.isOwn)
      Alert.alert(
        "Delete reel?",
        "This reel will be permanently removed everywhere.",
        [
          { text: "No", style: "cancel" },
          {
            text: "Yes, delete",
            style: "destructive",
            onPress: async () => {
              await api.deleteFeedPost(item.feedPostId!, token);
              await onChanged();
            },
          },
        ],
      );
    else
      Alert.alert(
        "Reel options",
        "You can report content that violates the community rules.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Report",
            style: "destructive",
            onPress: () =>
              void api.reportFeedPost(item.feedPostId!, "other", token),
          },
        ],
      );
  }
  return (
    <View style={[styles.reel, { height }]}>
      {expoGo ? (
        <Pressable
          style={styles.expoVideoFallback}
          onPress={() => void Linking.openURL(mediaUrl)}
        >
          <Text style={styles.fallbackPlay}>▶</Text>
          <Text style={styles.fallbackText}>Tap to play video</Text>
        </Pressable>
      ) : (
        <VideoView
          pointerEvents="none"
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      )}
      <View pointerEvents="none" style={styles.reelShade} />
      <Pressable
        accessibilityLabel="Reel options"
        onPress={openOptions}
        style={styles.reelMore}
      >
        <Ionicons name="ellipsis-horizontal" size={28} color="#fff" />
      </Pressable>
      <View style={styles.reelContent}>
        <View style={styles.creatorRow}>
          <View style={styles.creatorAvatar}>
            <Text style={styles.creatorAvatarText}>
              {(item.author?.displayName ?? item.sourceName)
                .slice(0, 1)
                .toUpperCase()}
            </Text>
          </View>
          <View style={styles.creatorCopy}>
            <VerifiedName
              name={item.author?.displayName ?? item.sourceName}
              type={item.author?.verificationType}
              textStyle={styles.creatorName}
            />
            <Text style={styles.creatorHandle}>
              {item.author ? `@${item.author.handle}` : "SidCraft publisher"}
            </Text>
          </View>
          {item.author ? (
            <Pressable
              onPress={() => void toggleFollow()}
              style={[styles.followButton, following && styles.followingButton]}
            >
              <Text style={styles.followButtonText}>
                {following ? "Following" : "Follow"}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.reelHeadline}>{item.headline}</Text>
        {item.summary && item.summary !== item.headline ? (
          <Text numberOfLines={2} style={styles.reelSummary}>
            {item.summary}
          </Text>
        ) : null}
        <View style={styles.audioRow}>
          <Ionicons name="musical-notes" size={13} color="#fff" />
          <Text numberOfLines={1} style={styles.reelSource}>
            Original audio · {item.sourceName}
          </Text>
        </View>
      </View>
      <View style={styles.reelActions}>
        <Pressable
          onPress={() => void toggleLike()}
          style={styles.reelActionButton}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={30}
            color={liked ? "#ff416c" : "#fff"}
          />
          <Text style={styles.reelActionCount}>{likeCount}</Text>
        </Pressable>
        <Pressable onPress={openComments} style={styles.reelActionButton}>
          <Ionicons name="chatbubble-outline" size={29} color="#fff" />
          <Text style={styles.reelActionCount}>0</Text>
        </Pressable>
        <Pressable
          onPress={() => void toggleRepost()}
          style={styles.reelActionButton}
        >
          <Ionicons
            name="repeat"
            size={31}
            color={reposted ? palette.accent : "#fff"}
          />
          <Text style={styles.reelActionCount}>0</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            void Share.share({ message: `${item.headline}\n${mediaUrl}` })
          }
        >
          <View style={styles.reelActionButton}>
            <Ionicons name="paper-plane-outline" size={29} color="#fff" />
            <Text style={styles.reelActionCount}>Share</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setSaved((value) => !value)}
          style={styles.reelActionButton}
        >
          <Ionicons
            name={saved ? "bookmark" : "bookmark-outline"}
            size={29}
            color={saved ? palette.accent : "#fff"}
          />
        </Pressable>
        <View style={styles.audioDisc}>
          <Text style={styles.audioDiscText}>♪</Text>
        </View>
      </View>
      <Modal
        visible={commentsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCommentsOpen(false)}
      >
        <Pressable
          style={styles.composerBackdrop}
          onPress={() => setCommentsOpen(false)}
        >
          <Pressable
            style={styles.commentsSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.composerHeading}>
              <Text style={styles.composerTitle}>Comments</Text>
              <Pressable onPress={() => setCommentsOpen(false)}>
                <Ionicons name="close" size={25} color={palette.text} />
              </Pressable>
            </View>
            <FlatList
              data={comments}
              keyExtractor={(comment) => comment.id}
              style={styles.commentsList}
              ListEmptyComponent={
                <Text style={styles.noComments}>
                  No comments yet. Start the conversation.
                </Text>
              }
              renderItem={({ item: comment }) => (
                <View style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>
                      {comment.author.displayName.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentAuthor}>
                      @{comment.author.handle}
                      {comment.author.verificationType ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={13}
                          color={verificationColor(
                            comment.author.verificationType,
                          )}
                        />
                      ) : null}
                    </Text>
                    <Text style={styles.commentText}>{comment.body}</Text>
                  </View>
                </View>
              )}
            />
            <View style={styles.commentComposer}>
              <TextInput
                value={commentBody}
                onChangeText={setCommentBody}
                placeholder="Add a comment…"
                placeholderTextColor={palette.muted}
                style={styles.commentInput}
              />
              <Pressable
                disabled={!commentBody.trim()}
                onPress={() => void sendComment()}
              >
                <Text style={styles.commentSend}>Post</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  header: {
    height: 54,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reelHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 48,
    zIndex: 20,
    backgroundColor: "transparent",
  },
  brand: { color: palette.text, fontSize: 20, fontWeight: "900" },
  createReel: {
    position: "absolute",
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,12,17,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
    zIndex: 22,
  },
  productTitle: { alignItems: "flex-end" },
  title: { color: palette.text, fontSize: 16, fontWeight: "900" },
  subtitle: {
    color: palette.muted,
    fontSize: 8,
    letterSpacing: 1.2,
    fontWeight: "800",
    marginTop: 1,
  },
  categoryList: { flexGrow: 0, height: 44 },
  categories: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 99,
    paddingHorizontal: 13,
    height: 34,
    justifyContent: "center",
  },
  activeChip: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { color: palette.text, fontSize: 12, fontWeight: "700" },
  activeText: { color: palette.onAccent },
  deck: { flex: 1, overflow: "hidden" },
  verticalPager: {
    flex: 1,
    ...({
      scrollSnapType: "y mandatory",
      overscrollBehaviorY: "contain",
    } as {}),
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  error: { color: "#ff8066" },
  retry: { color: palette.accent, fontWeight: "900", marginTop: 12 },
  emptyTitle: { color: palette.text, fontSize: 22, fontWeight: "900" },
  emptyText: {
    color: palette.muted,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
  newsCard: {
    backgroundColor: palette.background,
    overflow: "hidden",
    ...({ scrollSnapAlign: "start", scrollSnapStop: "always" } as {}),
  },
  newsGallery: {
    width: "100%",
    height: "43%",
    backgroundColor: palette.surface,
  },
  newsImage: {
    width: "100%",
    height: "100%",
    backgroundColor: palette.surface,
  },
  galleryCount: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.66)",
  },
  galleryCountText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  galleryDots: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 30,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  galleryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.48)",
  },
  galleryDotActive: { width: 16, backgroundColor: palette.accent },
  newsContent: {
    flex: 1,
    marginTop: -22,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: palette.surface,
    paddingHorizontal: 19,
    paddingTop: 17,
    paddingBottom: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: palette.borderSoft,
  },
  newsMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  topic: {
    color: palette.accent,
    fontSize: 10,
    letterSpacing: 1.3,
    fontWeight: "900",
  },
  sourceBadge: {
    maxWidth: "60%",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: palette.surface,
  },
  sourceBadgeText: { color: palette.text, fontSize: 9, fontWeight: "700" },
  headline: {
    color: palette.text,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
    marginTop: 8,
  },
  summary: { color: palette.text, fontSize: 14, lineHeight: 20, marginTop: 8 },
  evidence: {
    backgroundColor: palette.surface,
    borderLeftWidth: 3,
    borderLeftColor: palette.accent,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    marginTop: 10,
  },
  evidenceLabel: {
    color: palette.accent,
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: "900",
  },
  evidenceText: {
    color: "#b5bdae",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 3,
  },
  newsActions: {
    marginTop: "auto",
    paddingTop: 12,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  readSource: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accent,
  },
  readSourceText: { color: palette.onAccent, fontSize: 11, fontWeight: "900" },
  shareButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  shareIcon: { color: palette.text, fontSize: 17, fontWeight: "900" },
  swipe: {
    color: palette.muted,
    fontSize: 8,
    letterSpacing: 1.1,
    marginLeft: "auto",
  },
  reel: { backgroundColor: palette.mediaBackground, position: "relative" },
  reelShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  reelMore: {
    position: "absolute",
    top: 18,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  reelContent: { position: "absolute", left: 16, right: 76, bottom: 30 },
  reelCategory: { color: palette.accent, fontSize: 10, fontWeight: "900" },
  reelHeadline: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    marginTop: 10,
  },
  reelSummary: {
    color: palette.text,
    lineHeight: 18,
    marginTop: 4,
    fontSize: 13,
  },
  reelSource: { color: "#fff", fontSize: 11, fontWeight: "700", flexShrink: 1 },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  creatorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.borderSoft,
    borderWidth: 2,
    borderColor: "#fff",
  },
  creatorAvatarText: { color: palette.accent, fontWeight: "900" },
  creatorCopy: { minWidth: 0, flexShrink: 1 },
  creatorName: { color: "#fff", fontWeight: "900", fontSize: 14 },
  creatorHandle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 10,
    marginTop: 1,
  },
  followButton: {
    marginLeft: 4,
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  followingButton: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.55)",
  },
  followButtonText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  audioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 9,
  },
  reelActions: {
    position: "absolute",
    right: 10,
    bottom: 24,
    gap: 17,
    alignItems: "center",
  },
  reelActionButton: {
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  reelActionCount: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 3,
  },
  audioDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceStrong,
    borderWidth: 3,
    borderColor: palette.borderSoft,
  },
  audioDiscText: { color: "#fff", fontWeight: "900" },
  expoVideoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  fallbackPlay: { color: palette.accent, fontSize: 54 },
  fallbackText: { color: "#fff", fontWeight: "800", marginTop: 10 },
  modeDock: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  modeBar: {
    width: 134,
    height: 34,
    flexDirection: "row",
    padding: 3,
    borderRadius: 99,
    backgroundColor: "rgba(24,29,38,0.96)",
    borderWidth: 1,
    borderColor: palette.borderSoft,
    zIndex: 5,
  },
  modeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 99,
  },
  modeActive: { backgroundColor: palette.accent },
  modeText: { color: palette.muted, fontSize: 10, fontWeight: "900" },
  modeTextActive: { color: palette.onAccent },
  composerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.64)",
  },
  reelComposer: {
    backgroundColor: palette.surfaceStrong,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.muted,
    alignSelf: "center",
    marginBottom: 14,
  },
  composerHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  composerTitle: { color: palette.text, fontSize: 21, fontWeight: "900" },
  sourceRow: { flexDirection: "row", gap: 12, marginTop: 18 },
  sourceButton: {
    flex: 1,
    height: 88,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: palette.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  sourceButtonText: { color: palette.text, fontWeight: "800" },
  selectedVideo: {
    marginTop: 18,
    minHeight: 64,
    borderRadius: 16,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectedVideoName: { flex: 1, color: palette.text, fontWeight: "700" },
  captionInput: {
    minHeight: 100,
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    color: palette.text,
    padding: 14,
    textAlignVertical: "top",
  },
  publishReel: {
    height: 50,
    borderRadius: 16,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  publishReelText: { color: palette.onAccent, fontWeight: "900" },
  disabled: { opacity: 0.4 },
  cameraScreen: { flex: 1, backgroundColor: "#000" },
  cameraTop: {
    position: "absolute",
    top: 50,
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cameraTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  shutter: {
    position: "absolute",
    bottom: 50,
    alignSelf: "center",
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#fff",
    borderWidth: 7,
    borderColor: "rgba(255,255,255,0.45)",
  },
  shutterRecording: { backgroundColor: "#ff174d", borderRadius: 18 },
  commentsSheet: {
    height: "72%",
    backgroundColor: palette.surfaceStrong,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  commentsList: { marginTop: 12 },
  noComments: { color: palette.muted, textAlign: "center", marginTop: 50 },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 11,
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarText: { color: palette.accent, fontWeight: "900" },
  commentAuthor: { color: palette.text, fontSize: 12, fontWeight: "900" },
  commentText: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  commentComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: palette.borderSoft,
    paddingTop: 12,
  },
  commentInput: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    color: "#fff",
    paddingHorizontal: 15,
  },
  commentSend: { color: palette.accent, fontWeight: "900" },
});
