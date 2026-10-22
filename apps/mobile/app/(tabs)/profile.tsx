import { palette } from "../../src/theme";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import { mediaFileSize, readMediaAsBase64 } from "../../src/media-file";
import { useVideoPlayer, VideoView } from "expo-video";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { FeedPost, ProfileOverview, Story } from "@pulse/contracts";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { VerifiedName } from "../../src/verified-name";

type Tab = "posts" | "reels" | "anonymous" | "reposts" | "tagged";
type CreateKind = "post" | "reel" | "anonymous" | "story" | "highlight";
type Attachment = {
  uri: string;
  kind: "image" | "video";
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  durationSeconds: number | null;
};
const tabs: Array<{
  key: Tab;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}> = [
  { key: "posts", icon: "grid-outline", label: "Posts" },
  { key: "reels", icon: "play-outline", label: "Reels" },
  { key: "anonymous", icon: "shield-checkmark-outline", label: "Anonymous" },
  { key: "reposts", icon: "repeat-outline", label: "Reposts" },
  { key: "tagged", icon: "person-outline", label: "Tagged" },
];

export default function Profile() {
  return <ProfileScreen />;
}

export function ProfileScreen({ viewedUserId }: { viewedUserId?: string }) {
  const auth = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("posts");
  const [createMenu, setCreateMenu] = useState(false);
  const [accounts, setAccounts] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState<Attachment | null>(null);
  const [avatarCapture, setAvatarCapture] = useState(false);
  const [viewer, setViewer] = useState<{
    items: FeedPost[];
    index: number;
    title: string;
    tab: Tab;
  } | null>(null);
  const [highlightViewer, setHighlightViewer] = useState<Story | null>(null);
  const [composer, setComposer] = useState<CreateKind | null>(null);
  const [caption, setCaption] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<"picture" | "video">("picture");
  const [camera, setCamera] = useState<CameraView | null>(null);
  const [recording, setRecording] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const load = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      setProfile(await api.profile(auth.accessToken, viewedUserId));
    } catch (e) {
      Alert.alert(
        "Profile unavailable",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, viewedUserId]);
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
      const refreshTimer = setInterval(() => void load(), 10_000);
      return () => clearInterval(refreshTimer);
    }, [load]),
  );
  const visibleTabs = useMemo(
    () => tabs.filter((item) => item.key !== "anonymous" || profile?.isOwn),
    [profile?.isOwn],
  );
  if (!auth.loading && !auth.accessToken) return <Redirect href="/login" />;

  function openComposer(kind: CreateKind) {
    setCreateMenu(false);
    setComposer(kind);
    setCaption("");
    setAttachment(null);
    setCameraMode(kind === "reel" ? "video" : "picture");
  }
  async function chooseMedia() {
    if (!composer) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: composer === "reel" ? "video/*" : ["image/*", "video/*"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if ((asset.size ?? 1) > 20_000_000)
      return Alert.alert("File too large", "Choose media up to 20 MB.");
    const kind = asset.mimeType?.startsWith("video/") ? "video" : "image";
    setAttachment({
      uri: asset.uri,
      kind,
      mimeType:
        asset.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
      originalName: asset.name,
      sizeBytes: asset.size ?? 1,
      durationSeconds: kind === "video" && composer === "reel" ? 180 : null,
    });
  }
  async function chooseAvatar() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "video/*"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if ((asset.size ?? 1) > 20_000_000)
      return Alert.alert("File too large", "Choose media up to 20 MB.");
    const kind = asset.mimeType?.startsWith("video/") ? "video" : "image";
    setAvatarDraft({
      uri: asset.uri,
      kind,
      mimeType:
        asset.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
      originalName: asset.name,
      sizeBytes: asset.size ?? 1,
      durationSeconds: null,
    });
    setAvatarMenu(false);
  }
  async function openAvatarCamera(mode: "picture" | "video") {
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) return;
    }
    setAvatarCapture(true);
    setCameraMode(mode);
    setAvatarMenu(false);
    setCameraOpen(true);
  }
  async function openCamera() {
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) return;
    }
    setCameraOpen(true);
  }
  async function capture() {
    if (!camera) return;
    if (cameraMode === "picture") {
      const shot = await camera.takePictureAsync({ quality: 0.75 });
      if (!shot?.uri) return;
      const sizeBytes = await mediaFileSize(shot.uri);
      const value = {
        uri: shot.uri,
        kind: "image" as const,
        mimeType: "image/jpeg",
        originalName: `photo-${Date.now()}.jpg`,
        sizeBytes,
        durationSeconds: null,
      };
      avatarCapture ? setAvatarDraft(value) : setAttachment(value);
      setAvatarCapture(false);
      setCameraOpen(false);
      return;
    }
    if (recording) {
      camera.stopRecording();
      return;
    }
    setRecording(true);
    const video = await camera.recordAsync({
      maxDuration: avatarCapture ? 15 : 180,
    });
    setRecording(false);
    if (!video?.uri) return;
    const sizeBytes = await mediaFileSize(video.uri);
    const value = {
      uri: video.uri,
      kind: "video" as const,
      mimeType: "video/mp4",
      originalName: `video-${Date.now()}.mp4`,
      sizeBytes,
      durationSeconds: avatarCapture ? 15 : 180,
    };
    avatarCapture ? setAvatarDraft(value) : setAttachment(value);
    setAvatarCapture(false);
    setCameraOpen(false);
  }
  async function publish() {
    if (
      !auth.accessToken ||
      !composer ||
      !attachment ||
      (composer !== "highlight" && !caption.trim())
    )
      return;
    setPublishing(true);
    try {
      const base64 = await readMediaAsBase64(attachment.uri);
      if (composer === "highlight" || composer === "story")
        await api.createStory(
          {
            caption: caption.trim(),
            isHighlight: composer === "highlight",
            media: {
              kind: attachment.kind,
              mimeType: attachment.mimeType,
              originalName: attachment.originalName,
              sizeBytes: attachment.sizeBytes,
              durationSeconds: attachment.durationSeconds,
              base64,
            },
          },
          auth.accessToken,
        );
      else
        await api.createFeedPost(
          {
            body: caption.trim(),
            anonymous: composer === "anonymous",
            media: [
              {
                kind: attachment.kind,
                mimeType: attachment.mimeType,
                originalName: attachment.originalName,
                sizeBytes: attachment.sizeBytes,
                durationSeconds:
                  composer === "reel" ? 180 : attachment.durationSeconds,
                base64,
              },
            ],
            poll: null,
          },
          auth.accessToken,
        );
      setComposer(null);
      setAttachment(null);
      setCaption("");
      await load();
    } catch (e) {
      Alert.alert(
        "Could not publish",
        e instanceof Error ? e.message : "Try again.",
      );
    } finally {
      setPublishing(false);
    }
  }
  const items = profile?.[tab] ?? [];
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        {viewedUserId ? (
          <Pressable
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={s.headerIcon}
          >
            <Ionicons name="chevron-back" size={28} color={palette.text} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="Create"
            onPress={() => setCreateMenu(true)}
            style={s.headerIcon}
          >
            <Ionicons name="add" size={30} color={palette.text} />
          </Pressable>
        )}
        <Pressable
          accessibilityLabel="Switch account"
          onPress={() => setAccounts(true)}
          style={s.accountSwitch}
        >
          {profile?<VerifiedName name={`@${profile.user.handle}`} type={profile.user.verificationType} size={17} textStyle={s.handle} numberOfLines={1}/>:<Text style={s.handle}>Profile</Text>}
          <Ionicons name="chevron-down" size={17} color={palette.text} />
        </Pressable>
        {viewedUserId ? (
          <View style={s.headerIcon} />
        ) : (
          <Pressable
            accessibilityLabel="Settings"
            onPress={() => router.push("/settings" as never)}
            style={s.headerIcon}
          >
            <Ionicons name="settings-outline" size={24} color={palette.text} />
          </Pressable>
        )}
      </View>
      {loading || !profile ? (
        <View style={s.loader}>
          <ActivityIndicator color={palette.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={3}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.content}
          columnWrapperStyle={items.length ? s.gridRow : undefined}
          ListHeaderComponent={
            <>
              <View style={s.summary}>
                <Pressable
                  disabled={!profile.isOwn}
                  accessibilityLabel="Change profile picture or video"
                  onPress={() => setAvatarMenu(true)}
                  style={s.avatarWrap}
                >
                  <ProfileAvatar profile={profile} />
                  {profile.isOwn ? (
                    <View style={s.avatarAdd}>
                      <Ionicons name="add" size={15} color={palette.onAccent} />
                    </View>
                  ) : null}
                </Pressable>
                <Stat value={profile.counts.posts} label="Posts" />
                {profile.isOwn ? (
                  <Stat
                    value={profile.counts.anonymous ?? 0}
                    label="Anonymous"
                  />
                ) : null}
                <Stat value={profile.counts.followers} label="Followers" onPress={()=>router.push(`/connections?userId=${profile.user.id}&kind=followers` as never)}/>
                <Stat value={profile.counts.following} label="Following" onPress={()=>router.push(`/connections?userId=${profile.user.id}&kind=following` as never)}/>
              </View>
              <View style={s.identity}>
                <VerifiedName name={profile.user.displayName} type={profile.user.verificationType} size={18} textStyle={s.display}/>
                <Text style={s.username}>@{profile.user.handle}</Text>
                {profile.user.bio ? (
                  <Text style={s.bio}>{profile.user.bio}</Text>
                ) : null}
                {profile.user.website ? (
                  <Text style={s.website}>{profile.user.website}</Text>
                ) : null}
              </View>
              <View style={s.profileActions}>
                <Pressable
                  onPress={() =>
                    profile.isOwn
                      ? setEditOpen(true)
                      : auth.accessToken &&
                        api
                          .followFeedAuthor(
                            profile.user.id,
                            !profile.viewerFollows,
                            auth.accessToken,
                          )
                          .then(() =>
                            setProfile((current) =>
                              current
                                ? {
                                    ...current,
                                    viewerFollows: !current.viewerFollows,
                                    counts: {
                                      ...current.counts,
                                      followers:
                                        current.counts.followers +
                                        (current.viewerFollows ? -1 : 1),
                                    },
                                  }
                                : current,
                            ),
                          )
                  }
                  style={s.action}
                >
                  <Text style={s.actionText}>
                    {profile.isOwn
                      ? "Edit profile"
                      : profile.viewerFollows
                        ? "Following"
                        : "Follow"}
                  </Text>
                </Pressable>
                <Pressable style={s.action}>
                  <Text style={s.actionText}>Share profile</Text>
                </Pressable>
                <Pressable style={s.smallAction}>
                  <Ionicons
                    name="person-add-outline"
                    size={18}
                    color={palette.text}
                  />
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.highlights}
              >
                <Pressable
                  onPress={() => openComposer("highlight")}
                  style={s.highlight}
                >
                  <View style={s.highlightCircle}>
                    <Ionicons name="add" size={28} color={palette.text} />
                  </View>
                  <Text style={s.highlightLabel}>New</Text>
                </Pressable>
                {profile.highlights.map((highlight) => (
                  <Pressable
                    key={highlight.id}
                    onPress={() => setHighlightViewer(highlight)}
                    style={s.highlight}
                  >
                    <View style={s.highlightCircle}>
                      {highlight.media.kind === "image" ? (
                        <Image
                          source={{ uri: api.mediaUrl(highlight.media.url) }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={s.highlightVideo}>
                          <Ionicons name="play" size={24} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={1} style={s.highlightLabel}>
                      {highlight.caption || "Highlight"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={s.tabs}>
                {visibleTabs.map((item) => (
                  <Pressable
                    accessibilityLabel={item.label}
                    key={item.key}
                    onPress={() => setTab(item.key)}
                    style={[s.tab, tab === item.key && s.activeTab]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={22}
                      color={tab === item.key ? palette.text : palette.muted}
                    />
                  </Pressable>
                ))}
              </View>
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void load()}
              tintColor={palette.accent}
            />
          }
          renderItem={({ item, index }) => (
            <Tile
              post={item}
              reel={tab === "reels"}
              onPress={() =>
                setViewer({
                  items,
                  index,
                  title:
                    tabs.find((item) => item.key === tab)?.label ?? "Posts",
                  tab,
                })
              }
            />
          )}
          ListEmptyComponent={<Empty tab={tab} own={profile.isOwn} />}
        />
      )}
      <CreateSheet
        visible={createMenu}
        close={() => setCreateMenu(false)}
        select={openComposer}
        live={() => {
          setCreateMenu(false);
          router.push({ pathname: "/(tabs)/feed", params: { startLive: "1" } });
        }}
      />
      <Composer
        visible={!!composer}
        kind={composer}
        caption={caption}
        attachment={attachment}
        busy={publishing}
        setCaption={setCaption}
        close={() => setComposer(null)}
        camera={() => void openCamera()}
        media={() => void chooseMedia()}
        publish={() => void publish()}
      />
      <Modal
        visible={cameraOpen}
        animationType="slide"
        onRequestClose={() => setCameraOpen(false)}
      >
        <View style={s.cameraPage}>
          <CameraView
            ref={setCamera}
            style={StyleSheet.absoluteFill}
            mode={cameraMode === "video" ? "video" : "picture"}
          />
          <SafeAreaView style={s.cameraOverlay}>
            <Pressable onPress={() => setCameraOpen(false)}>
              <Ionicons name="close" size={31} color="#fff" />
            </Pressable>
            <View style={s.cameraModes}>
              {composer !== "reel" ? (
                <Pressable onPress={() => setCameraMode("picture")}>
                  <Text
                    style={[
                      s.cameraMode,
                      cameraMode === "picture" && s.cameraActive,
                    ]}
                  >
                    PHOTO
                  </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setCameraMode("video")}>
                <Text
                  style={[
                    s.cameraMode,
                    cameraMode === "video" && s.cameraActive,
                  ]}
                >
                  VIDEO
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => void capture()}
              style={[s.shutter, recording && s.recording]}
            >
              <View style={s.shutterInner} />
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
      <Sheet
        visible={accounts}
        close={() => setAccounts(false)}
        title="Switch account"
      >
        <View style={s.accountRow}>
          <View style={s.miniAvatar}>
            <Text style={s.avatarText}>
              {initials(profile?.user.displayName ?? "P")}
            </Text>
          </View>
          <View style={s.rowCopy}>
            <Text style={s.rowLabel}>@{profile?.user.handle ?? "profile"}</Text>
            <Text style={s.rowHint}>{profile?.user.displayName}</Text>
          </View>
          <Ionicons name="checkmark-circle" size={22} color={palette.accent} />
        </View>
        <Pressable
          onPress={async () => {
            setAccounts(false);
            await auth.logout();
            router.replace("/login");
          }}
          style={s.row}
        >
          <RowIcon name="add" accent />
          <Text style={s.rowLabel}>Add another account</Text>
        </Pressable>
      </Sheet>
      <AvatarSheet
        visible={avatarMenu}
        close={() => setAvatarMenu(false)}
        photo={() => void openAvatarCamera("picture")}
        video={() => void openAvatarCamera("video")}
        media={() => void chooseAvatar()}
      />
      <AvatarFrame
        visible={!!avatarDraft}
        attachment={avatarDraft}
        close={() => setAvatarDraft(null)}
        save={async (crop) => {
          if (!profile || !avatarDraft || !auth.accessToken) return;
          const base64 = await readMediaAsBase64(avatarDraft.uri);
          setProfile(
            await api.updateProfile(
              {
                displayName: profile.user.displayName,
                username: profile.user.handle,
                bio: profile.user.bio,
                website: profile.user.website,
                avatar: {
                  kind: avatarDraft.kind,
                  mimeType: avatarDraft.mimeType,
                  base64,
                  ...crop,
                },
              },
              auth.accessToken,
            ),
          );
          setAvatarDraft(null);
        }}
      />
      <EditProfile
        visible={editOpen}
        profile={profile}
        token={auth.accessToken}
        close={() => setEditOpen(false)}
        saved={(next) => {
          setProfile(next);
          setEditOpen(false);
        }}
      />
      <ContentViewer
        value={viewer}
        token={auth.accessToken}
        close={() => setViewer(null)}
        changed={(updated) => {
          setViewer((current) =>
            current
              ? {
                  ...current,
                  items: current.items.map((item) =>
                    item.id === updated.id ? updated : item,
                  ),
                }
              : null,
          );
          setProfile((current) =>
            current
              ? {
                  ...current,
                  posts: replacePost(current.posts, updated),
                  reels: replacePost(current.reels, updated),
                  anonymous: replacePost(current.anonymous, updated),
                  reposts: updated.viewerReposted
                    ? replacePost(current.reposts, updated, true)
                    : current.reposts.filter((item) => item.id !== updated.id),
                  tagged: replacePost(current.tagged, updated),
                }
              : current,
          );
        }}
        removed={(id) => {
          setViewer(null);
          setProfile((current) =>
            current
              ? {
                  ...current,
                  posts: current.posts.filter((p) => p.id !== id),
                  reels: current.reels.filter((p) => p.id !== id),
                  anonymous: current.anonymous.filter((p) => p.id !== id),
                  reposts: current.reposts.filter((p) => p.id !== id),
                  tagged: current.tagged.filter((p) => p.id !== id),
                  counts: {
                    ...current.counts,
                    posts: Math.max(0, current.counts.posts - 1),
                    anonymous: current.counts.anonymous,
                  },
                }
              : current,
          );
        }}
      />
      <Modal
        visible={!!highlightViewer}
        animationType="fade"
        onRequestClose={() => setHighlightViewer(null)}
      >
        <View style={s.highlightViewer}>
          {highlightViewer?.media.kind === "image" ? (
            <Image
              source={{ uri: api.mediaUrl(highlightViewer.media.url) }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />
          ) : highlightViewer ? (
            <InlineVideo url={api.mediaUrl(highlightViewer.media.url)} />
          ) : null}
          <SafeAreaView style={s.highlightHead}>
            <Pressable onPress={() => setHighlightViewer(null)}>
              <Ionicons name="chevron-back" size={30} color="#fff" />
            </Pressable>
            <Text numberOfLines={1} style={s.viewerTitle}>
              {highlightViewer?.caption || "Highlight"}
            </Text>
            {highlightViewer?.isOwn ? (
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Delete highlight?",
                    "This highlight will be permanently removed.",
                    [
                      { text: "No", style: "cancel" },
                      {
                        text: "Yes, delete",
                        style: "destructive",
                        onPress: async () => {
                          if (!highlightViewer || !auth.accessToken) return;
                          await api.deleteStory(
                            highlightViewer.id,
                            auth.accessToken,
                          );
                          setProfile((current) =>
                            current
                              ? {
                                  ...current,
                                  highlights: current.highlights.filter(
                                    (item) => item.id !== highlightViewer.id,
                                  ),
                                }
                              : current,
                          );
                          setHighlightViewer(null);
                        },
                      },
                    ],
                  )
                }
              >
                <Ionicons name="ellipsis-horizontal" size={26} color="#fff" />
              </Pressable>
            ) : (
              <View style={{ width: 26 }} />
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ value, label,onPress }: { value: number; label: string;onPress?:()=>void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={s.stat}>
      <Text style={s.statValue}>{compact(value)}</Text>
      <Text numberOfLines={1} style={s.statLabel}>
        {label}
      </Text>
    </Pressable>
  );
}
function ProfileAvatar({ profile }: { profile: ProfileOverview }) {
  const source = profile.user.avatar
    ? api.mediaUrl(profile.user.avatar.url)
    : null;
  const avatar = profile.user.avatar;
  const player = useVideoPlayer(
    avatar?.kind === "video" && source ? source : null,
    (value) => {
      value.loop = true;
      value.muted = true;
      value.play();
    },
  );
  const positioned = avatar
    ? {
        transform: [
          { translateX: avatar.offsetX * 80 },
          { translateY: avatar.offsetY * 80 },
          { scale: avatar.scale },
        ],
      }
    : null;
  return (
    <View style={s.avatar}>
      {avatar?.kind === "image" && source ? (
        <Image
          source={{ uri: source }}
          style={[StyleSheet.absoluteFill, positioned]}
          resizeMode="cover"
        />
      ) : avatar?.kind === "video" ? (
        <VideoView
          player={player}
          style={[StyleSheet.absoluteFill, positioned]}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <Text style={s.avatarText}>{initials(profile.user.displayName)}</Text>
      )}
    </View>
  );
}
function Tile({
  post,
  reel,
  onPress,
}: {
  post: FeedPost;
  reel: boolean;
  onPress(): void;
}) {
  const media = post.media[0];
  return (
    <Pressable
      accessibilityLabel={`Open ${reel ? "reel" : "post"}`}
      onPress={onPress}
      style={s.tile}
    >
      {media?.kind === "image" ? (
        <Image
          source={{ uri: api.mediaUrl(media.url) }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <View style={s.textTile}>
          <Text numberOfLines={4} style={s.tileText}>
            {post.body || media?.originalName}
          </Text>
        </View>
      )}
      {reel || media?.kind === "video" ? (
        <View style={s.tilePlay}>
          <Ionicons name="play" size={16} color="#fff" />
        </View>
      ) : null}
      {post.media.length > 1 ? (
        <Ionicons style={s.multi} name="copy-outline" size={16} color="#fff" />
      ) : null}
    </Pressable>
  );
}
function Empty({ tab, own }: { tab: Tab; own: boolean }) {
  const copy: Record<Tab, [string, string]> = {
    posts: ["Share your moments", "Your photos and posts will appear here."],
    reels: ["Create your first reel", "Short videos you share will live here."],
    anonymous: [
      "Your private space",
      "Only you can see your anonymous posts here.",
    ],
    reposts: ["No reposts yet", "Posts you repost will appear here."],
    tagged: [
      "No tagged posts",
      own
        ? "Posts mentioning your username appear here."
        : "No public posts have tagged this account.",
    ],
  };
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons
          name={
            tab === "anonymous"
              ? "shield-checkmark-outline"
              : tab === "reels"
                ? "play-outline"
                : "images-outline"
          }
          size={34}
          color={palette.text}
        />
      </View>
      <Text style={s.emptyTitle}>{copy[tab][0]}</Text>
      <Text style={s.emptyCopy}>{copy[tab][1]}</Text>
    </View>
  );
}
function CreateSheet({
  visible,
  close,
  select,
  live,
}: {
  visible: boolean;
  close(): void;
  select(k: CreateKind): void;
  live(): void;
}) {
  const options: Array<
    [CreateKind | "live", keyof typeof Ionicons.glyphMap, string, string]
  > = [
    ["story", "add-circle-outline", "Story", "Share for 24 hours"],
    ["reel", "play-circle-outline", "Reel", "Record or import a short video"],
    ["post", "grid-outline", "Post", "Share a photo or video"],
    [
      "anonymous",
      "shield-checkmark-outline",
      "Anonymous",
      "Your identity stays private",
    ],
    ["highlight", "heart-circle-outline", "Highlight", "Add a story moment"],
    ["live", "radio-outline", "Live", "Broadcast to your followers"],
  ];
  return (
    <Sheet visible={visible} close={close} title="Create">
      {options.map(([key, icon, label, hint]) => (
        <Pressable
          key={key}
          onPress={() => (key === "live" ? live() : select(key))}
          style={s.row}
        >
          <RowIcon name={icon} accent />
          <View style={s.rowCopy}>
            <Text style={s.rowLabel}>{label}</Text>
            <Text style={s.rowHint}>{hint}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.muted} />
        </Pressable>
      ))}
    </Sheet>
  );
}
function Composer({
  visible,
  kind,
  caption,
  attachment,
  busy,
  setCaption,
  close,
  camera,
  media,
  publish,
}: {
  visible: boolean;
  kind: CreateKind | null;
  caption: string;
  attachment: Attachment | null;
  busy: boolean;
  setCaption(v: string): void;
  close(): void;
  camera(): void;
  media(): void;
  publish(): void;
}) {
  const disabled =
    !attachment ||
    busy ||
    (kind !== "highlight" && kind !== "story" && !caption.trim());
  return (
    <Sheet
      visible={visible}
      close={close}
      title={
        kind === "anonymous"
          ? "Anonymous post"
          : kind === "highlight"
            ? "New highlight"
            : kind === "story"
              ? "New story"
              : `New ${kind ?? "post"}`
      }
    >
      <TextInput
        value={caption}
        onChangeText={setCaption}
        placeholder="Write a caption..."
        placeholderTextColor={palette.muted}
        multiline
        style={s.caption}
      />
      {attachment ? (
        <View style={s.preview}>
          {attachment.kind === "image" ? (
            <Image
              source={{ uri: attachment.uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="play-circle" size={50} color="#fff" />
          )}
          <View style={s.ready}>
            <Ionicons name="checkmark" size={14} color={palette.onAccent} />
            <Text style={s.readyText}>Ready</Text>
          </View>
        </View>
      ) : (
        <View style={s.sources}>
          <Pressable onPress={camera} style={s.source}>
            <Ionicons name="camera-outline" size={28} color={palette.accent} />
            <Text style={s.sourceTitle}>Camera</Text>
            <Text style={s.rowHint}>Photo or video</Text>
          </Pressable>
          <Pressable onPress={media} style={s.source}>
            <Ionicons name="images-outline" size={28} color={palette.accent} />
            <Text style={s.sourceTitle}>Media</Text>
            <Text style={s.rowHint}>Choose from device</Text>
          </Pressable>
        </View>
      )}
      <Pressable
        disabled={disabled}
        onPress={publish}
        style={[s.publish, disabled && s.disabled]}
      >
        <Text style={s.publishText}>
          {busy
            ? "Publishing..."
            : kind === "highlight"
              ? "Add highlight"
              : "Share"}
        </Text>
      </Pressable>
    </Sheet>
  );
}
function EditProfile({
  visible,
  profile,
  token,
  close,
  saved,
}: {
  visible: boolean;
  profile: ProfileOverview | null;
  token: string | null;
  close(): void;
  saved(value: ProfileOverview): void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible || !profile) return;
    setName(profile.user.displayName);
    setUsername(profile.user.handle);
    setBio(profile.user.bio ?? "");
    setWebsite(profile.user.website ?? "");
    setState("idle");
  }, [visible, profile]);
  useEffect(() => {
    if (!visible || !profile) return;
    const clean = username.trim().toLowerCase();
    if (clean === profile.user.handle) {
      setState("idle");
      return;
    }
    const timer = setTimeout(() => {
      setState("checking");
      api
        .usernameAvailability({
          username: clean,
          displayName: name || profile.user.displayName,
        })
        .then((value) => setState(value.available ? "available" : "taken"))
        .catch(() => setState("invalid"));
    }, 450);
    return () => clearTimeout(timer);
  }, [username, name, visible, profile]);
  const save = async () => {
    if (
      !profile ||
      !token ||
      !name.trim() ||
      !username.trim() ||
      state === "taken" ||
      state === "checking" ||
      state === "invalid"
    )
      return;
    setBusy(true);
    try {
      saved(
        await api.updateProfile(
          {
            displayName: name.trim(),
            username: username.trim().toLowerCase(),
            bio: bio.trim() || null,
            website: website.trim() || null,
          },
          token,
        ),
      );
    } catch (error) {
      Alert.alert(
        "Could not update profile",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={s.editPage}>
        <View style={s.editHead}>
          <Pressable onPress={close}>
            <Ionicons name="close" size={27} color={palette.text} />
          </Pressable>
          <Text style={s.editTitle}>Edit profile</Text>
          <Pressable disabled={busy} onPress={() => void save()}>
            <Text style={s.done}>{busy ? "Saving" : "Done"}</Text>
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.editBody}
        >
          <EditField
            label="Display name"
            value={name}
            setValue={setName}
            maxLength={60}
          />
          <EditField
            label="Username"
            value={username}
            setValue={setUsername}
            maxLength={30}
            autoCapitalize="none"
          />
          <Text
            style={[
              s.availability,
              state === "available" && s.available,
              state === "taken" && s.unavailable,
            ]}
          >
            {state === "checking"
              ? "Checking availability…"
              : state === "available"
                ? "Username is available"
                : state === "taken"
                  ? "Username is already taken"
                  : username === profile?.user.handle
                    ? "This is your current username"
                    : "3–30 letters, numbers, periods or underscores"}
          </Text>
          <EditField
            label="Bio"
            value={bio}
            setValue={setBio}
            maxLength={280}
            multiline
          />
          <EditField
            label="Website"
            value={website}
            setValue={setWebsite}
            maxLength={500}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Text style={s.optional}>
            Bio and website are optional and appear below your display name.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
function EditField({
  label,
  value,
  setValue,
  ...props
}: { label: string; value: string; setValue(value: string): void } & Omit<
  ComponentProps<typeof TextInput>,
  "value" | "onChangeText"
>) {
  return (
    <View style={s.editField}>
      <Text style={s.editLabel}>{label}</Text>
      <TextInput
        {...props}
        value={value}
        onChangeText={setValue}
        placeholderTextColor={palette.muted}
        style={[s.editInput, props.multiline && s.editMultiline]}
      />
    </View>
  );
}
function AvatarSheet({
  visible,
  close,
  photo,
  video,
  media,
}: {
  visible: boolean;
  close(): void;
  photo(): void;
  video(): void;
  media(): void;
}) {
  return (
    <Sheet visible={visible} close={close} title="Profile picture">
      <Pressable onPress={photo} style={s.row}>
        <RowIcon name="camera-outline" accent />
        <View style={s.rowCopy}>
          <Text style={s.rowLabel}>Take photo</Text>
          <Text style={s.rowHint}>Use the camera now</Text>
        </View>
      </Pressable>
      <Pressable onPress={video} style={s.row}>
        <RowIcon name="videocam-outline" accent />
        <View style={s.rowCopy}>
          <Text style={s.rowLabel}>Record profile video</Text>
          <Text style={s.rowHint}>Loops continuously on your profile</Text>
        </View>
      </Pressable>
      <Pressable onPress={media} style={s.row}>
        <RowIcon name="images-outline" accent />
        <View style={s.rowCopy}>
          <Text style={s.rowLabel}>Choose from media</Text>
          <Text style={s.rowHint}>Import a photo or video</Text>
        </View>
      </Pressable>
    </Sheet>
  );
}
type AvatarCrop = { scale: number; offsetX: number; offsetY: number };
function AvatarFrame({
  visible,
  attachment,
  close,
  save,
}: {
  visible: boolean;
  attachment: Attachment | null;
  close(): void;
  save(value: AvatarCrop): void;
}) {
  const [crop, setCrop] = useState<AvatarCrop>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  useEffect(() => {
    if (attachment) setCrop({ scale: 1, offsetX: 0, offsetY: 0 });
  }, [attachment?.uri]);
  const zoom = (delta: number) =>
    setCrop((value) => ({ ...value, scale: clamp(value.scale + delta, 1, 4) }));
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={s.framePage}>
        <View style={s.editHead}>
          <Pressable onPress={close}>
            <Ionicons name="close" size={27} color="#fff" />
          </Pressable>
          <Text style={s.editTitle}>Position profile media</Text>
          <Pressable onPress={() => save(crop)}>
            <Text style={s.done}>Use</Text>
          </Pressable>
        </View>
        <View style={s.frameStage}>
          {attachment ? (
            <AvatarPreview
              attachment={attachment}
              crop={crop}
              change={setCrop}
            />
          ) : null}
          <View pointerEvents="none" style={s.cropRing} />
        </View>
        <View style={s.zoomBar}>
          <Pressable
            accessibilityLabel="Zoom out"
            onPress={() => zoom(-0.15)}
            style={s.zoomButton}
          >
            <Ionicons name="remove" size={25} color="#fff" />
          </Pressable>
          <View style={s.zoomTrack}>
            <View
              style={[
                s.zoomFill,
                { width: `${((crop.scale - 1) / 3) * 100}%` },
              ]}
            />
          </View>
          <Pressable
            accessibilityLabel="Zoom in"
            onPress={() => zoom(0.15)}
            style={s.zoomButton}
          >
            <Ionicons name="add" size={25} color="#fff" />
          </Pressable>
        </View>
        <View style={s.frameActions}>
          <Pressable
            onPress={() => setCrop({ scale: 1, offsetX: 0, offsetY: 0 })}
          >
            <Text style={s.resetText}>Reset</Text>
          </Pressable>
          <Text style={s.zoomText}>{Math.round(crop.scale * 100)}%</Text>
        </View>
        <Text style={s.frameHint}>
          Drag with one finger to reposition. Pinch with two fingers or use − /
          + to zoom.
        </Text>
      </SafeAreaView>
    </Modal>
  );
}
function AvatarPreview({
  attachment,
  crop,
  change,
}: {
  attachment: Attachment;
  crop: AvatarCrop;
  change(value: AvatarCrop): void;
}) {
  const player = useVideoPlayer(
    attachment.kind === "video" ? attachment.uri : null,
    (value) => {
      value.loop = true;
      value.muted = true;
      value.play();
    },
  );
  const start = useRef(crop);
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const width = Dimensions.get("window").width;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          start.current = crop;
          const touches = event.nativeEvent.touches;
          pinchStart.current =
            touches.length >= 2
              ? { distance: touchDistance(touches), scale: crop.scale }
              : null;
        },
        onPanResponderMove: (event, gesture) => {
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) {
            const distance = touchDistance(touches);
            const initial = pinchStart.current ?? {
              distance,
              scale: crop.scale,
            };
            pinchStart.current ??= initial;
            change({
              ...crop,
              scale: clamp(
                (initial.scale * distance) / Math.max(1, initial.distance),
                1,
                4,
              ),
            });
            return;
          }
          pinchStart.current = null;
          change({
            ...crop,
            offsetX: clamp(start.current.offsetX + gesture.dx / width, -1, 1),
            offsetY: clamp(start.current.offsetY + gesture.dy / width, -1, 1),
          });
        },
        onPanResponderRelease: () => {
          start.current = crop;
          pinchStart.current = null;
        },
        onPanResponderTerminate: () => {
          pinchStart.current = null;
        },
      }),
    [crop, change, width],
  );
  const transform = {
    transform: [
      { translateX: crop.offsetX * width },
      { translateY: crop.offsetY * width },
      { scale: crop.scale },
    ],
  };
  return (
    <View style={StyleSheet.absoluteFill} {...pan.panHandlers}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, transform]}>
        {attachment.kind === "image" ? (
          <Image
            source={{ uri: attachment.uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        )}
      </View>
    </View>
  );
}
function ContentViewer({
  value,
  token,
  close,
  changed,
  removed,
}: {
  value: { items: FeedPost[]; index: number; title: string; tab: Tab } | null;
  token: string | null;
  close(): void;
  changed(post: FeedPost): void;
  removed(id: string): void;
}) {
  const height = Dimensions.get("window").height - 78;
  const displayed = value
    ? value.tab === "reels"
      ? value.items
      : [
          ...value.items.slice(value.index),
          ...value.items.slice(0, value.index),
        ]
    : [];
  const act = async (
    post: FeedPost,
    action: "like" | "repost",
    optionId?: string,
  ) => {
    if (!token) return;
    try {
      const updated =
        action === "like"
          ? await api.likeFeedPost(post.id, !post.viewerLiked, token)
          : optionId
            ? await api.voteFeedPoll(
                post.id,
                post.poll?.allowMultiple
                  ? togglePollOptions(post, optionId)
                  : [optionId],
                token,
              )
            : await api.repostFeedPost(post.id, !post.viewerReposted, token);
      changed(updated);
    } catch (error) {
      Alert.alert(
        "Could not update post",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  };
  const menu = (post: FeedPost) => {
    if (!token) return;
    if (value?.tab === "reposts" && !post.isOwn) {
      Alert.alert("Post options", "Remove this repost from your profile?", [
        { text: "No", style: "cancel" },
        {
          text: "Yes, remove",
          style: "destructive",
          onPress: async () => {
            await api.repostFeedPost(post.id, false, token);
            removed(post.id);
          },
        },
      ]);
      return;
    }
    if (post.isOwn)
      Alert.alert(
        "Delete post?",
        "This post will be permanently removed everywhere.",
        [
          { text: "No", style: "cancel" },
          {
            text: "Yes, delete",
            style: "destructive",
            onPress: async () => {
              await api.deleteFeedPost(post.id, token);
              removed(post.id);
            },
          },
        ],
      );
    else
      Alert.alert(
        "Post options",
        "You can report content that violates the community rules.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Report",
            style: "destructive",
            onPress: () => void api.reportFeedPost(post.id, "other", token),
          },
        ],
      );
  };
  return (
    <Modal visible={!!value} animationType="slide" onRequestClose={close}>
      <View style={[s.viewer,value?.tab==="reels"?s.reelViewerBackground:s.feedViewerBackground]}>
        <SafeAreaView style={s.viewerHead}>
          <Pressable onPress={close}>
            <Ionicons name="chevron-back" size={28} color={value?.tab==="reels"?"#fff":palette.text} />
          </Pressable>
          <Text style={[s.viewerTitle,value?.tab!=="reels"&&{color:palette.text}]}>{value?.title}</Text>
          <View style={{ width: 28 }} />
        </SafeAreaView>
        {value ? (
          <FlatList
            data={displayed}
            extraData={displayed}
            keyExtractor={(item) => item.id}
            pagingEnabled={value.tab === "reels"}
            initialScrollIndex={value.tab === "reels" ? value.index : 0}
            getItemLayout={
              value.tab === "reels"
                ? (_, index) => ({
                    length: height,
                    offset: height * index,
                    index,
                  })
                : undefined
            }
            contentContainerStyle={
              value.tab === "reels" ? undefined : s.feedViewerList
            }
            renderItem={({ item }) =>
              value.tab === "reels" ? (
                <ReelViewer
                  post={item}
                  height={height}
                  like={() => void act(item, "like")}
                  repost={() => void act(item, "repost")}
                  menu={() => menu(item)}
                />
              ) : (
                <ProfileFeedCard
                  post={item}
                  like={() => void act(item, "like")}
                  repost={() => void act(item, "repost")}
                  vote={(id) => void act(item, "repost", id)}
                  menu={() => menu(item)}
                />
              )
            }
          />
        ) : null}
      </View>
    </Modal>
  );
}
function ProfileFeedCard({
  post,
  like,
  repost,
  vote,
  menu,
}: {
  post: FeedPost;
  like(): void;
  repost(): void;
  vote(id: string): void;
  menu(): void;
}) {
  return (
    <View style={s.feedCard}>
      <View style={s.feedAuthorRow}>
        <View style={s.feedAvatar}>
          <Text style={s.feedAvatarText}>
            {post.author?.displayName.slice(0, 1).toUpperCase() ?? "?"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <VerifiedName name={post.author?.displayName ?? "Anonymous"} type={post.author?.verificationType} textStyle={s.feedViewerAuthor}/>
          <Text style={s.feedHandle}>
            {post.author ? `@${post.author.handle}` : "Identity protected"} ·{" "}
            {relativeTime(post.createdAt)}
          </Text>
        </View>
        <Pressable accessibilityLabel="Post options" onPress={menu}>
          <Ionicons
            name="ellipsis-horizontal"
            size={22}
            color={palette.muted}
          />
        </Pressable>
      </View>
      {post.body ? <Text style={s.feedBody}>{post.body}</Text> : null}
      {post.media.length ? <ProfileMedia media={post.media} /> : null}
      {post.poll ? <ProfilePoll post={post} vote={vote} /> : null}
      <View style={s.feedActions}>
        <Pressable onPress={like} style={s.feedAction}>
          <Ionicons
            name={post.viewerLiked ? "heart" : "heart-outline"}
            size={21}
            color={post.viewerLiked ? "#ff4f70" : palette.muted}
          />
          <Text style={s.viewerCount}>{post.likeCount}</Text>
        </Pressable>
        <View style={s.feedAction}>
          <Ionicons name="chatbubble-outline" size={20} color={palette.muted} />
          <Text style={s.viewerCount}>{post.commentCount}</Text>
        </View>
        <Pressable onPress={repost} style={s.feedAction}>
          <Ionicons
            name="repeat"
            size={22}
            color={post.viewerReposted ? "#61dfb0" : palette.muted}
          />
          <Text style={s.viewerCount}>{post.repostCount}</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            void Share.share({
              message: `${post.body}\n${post.media.map((item) => api.mediaUrl(item.url)).join("\n")}`,
            })
          }
        >
          <Ionicons
            name="paper-plane-outline"
            size={21}
            color={palette.muted}
          />
        </Pressable>
      </View>
      {post.commentCount ? (
        <Text style={s.feedComments}>
          View all {post.commentCount} comments
        </Text>
      ) : null}
    </View>
  );
}
function ProfileMedia({ media }: { media: FeedPost["media"] }) {
  const [page, setPage] = useState(0);
  const width = Dimensions.get("window").width - 32;
  return (
    <View style={s.profileMedia}>
      <FlatList
        horizontal
        pagingEnabled
        data={media}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setPage(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item }) => (
          <View style={{ width, height: width }}>
            {item.kind === "image" ? (
              <Image
                source={{ uri: api.mediaUrl(item.url) }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : item.kind === "video" ? (
              <InlineVideo url={api.mediaUrl(item.url)} />
            ) : (
              <View style={s.document}>
                <Ionicons
                  name="document-outline"
                  size={42}
                  color={palette.accent}
                />
                <Text style={s.feedBody}>{item.originalName}</Text>
              </View>
            )}
          </View>
        )}
      />
      {media.length > 1 ? (
        <View style={s.mediaBadge}>
          <Text style={s.mediaBadgeText}>
            {page + 1}/{media.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
function InlineVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (value) => {
    value.loop = true;
    value.muted = true;
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls
    />
  );
}
function ProfilePoll({
  post,
  vote,
}: {
  post: FeedPost;
  vote(id: string): void;
}) {
  const poll = post.poll!;
  const reveal =
    poll.isClosed || poll.options.some((item) => item.viewerSelected);
  return (
    <View style={s.profilePoll}>
      <Text style={s.pollTitle}>{poll.question}</Text>
      {poll.options.map((option) => (
        <Pressable
          disabled={poll.isClosed}
          onPress={() => vote(option.id)}
          key={option.id}
          style={[s.pollOption, option.viewerSelected && s.pollSelected]}
        >
          <View
            style={[
              s.pollFill,
              { width: `${reveal ? option.percentage : 0}%` },
            ]}
          />
          <Text style={s.pollLabel}>
            {option.viewerSelected ? "✓ " : ""}
            {option.label}
          </Text>
          {reveal ? (
            <Text style={s.pollPercent}>{option.percentage}%</Text>
          ) : null}
        </Pressable>
      ))}
      <Text style={s.pollMeta}>
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"} ·{" "}
        {poll.isClosed
          ? "Final results"
          : poll.allowMultiple
            ? "Choose multiple"
            : "Choose one"}
      </Text>
    </View>
  );
}
function ReelViewer({
  post,
  height,
  like,
  repost,
  menu,
}: {
  post: FeedPost;
  height: number;
  like(): void;
  repost(): void;
  menu(): void;
}) {
  const video = post.media.find((item) => item.kind === "video");
  const player = useVideoPlayer(
    video ? api.mediaUrl(video.url) : null,
    (value) => {
      value.loop = true;
      value.play();
    },
  );
  return (
    <View style={[s.reelViewer, { height }]}>
      {video ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      ) : null}
      <View style={s.reelShade} />
      <Pressable
        accessibilityLabel="Post options"
        onPress={menu}
        style={s.reelMenu}
      >
        <Ionicons name="ellipsis-horizontal" size={28} color="#fff" />
      </Pressable>
      <View style={s.reelRail}>
        <Pressable onPress={like} style={s.reelButton}>
          <Ionicons
            name={post.viewerLiked ? "heart" : "heart-outline"}
            size={31}
            color={post.viewerLiked ? "#ff4f70" : "#fff"}
          />
          <Text style={s.reelCount}>{post.likeCount}</Text>
        </Pressable>
        <View style={s.reelButton}>
          <Ionicons name="chatbubble-outline" size={29} color="#fff" />
          <Text style={s.reelCount}>{post.commentCount}</Text>
        </View>
        <Pressable onPress={repost} style={s.reelButton}>
          <Ionicons
            name="repeat"
            size={31}
            color={post.viewerReposted ? "#61dfb0" : "#fff"}
          />
          <Text style={s.reelCount}>{post.repostCount}</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            void Share.share({
              message: `${post.body}\n${video ? api.mediaUrl(video.url) : ""}`,
            })
          }
        >
          <Ionicons name="paper-plane-outline" size={30} color="#fff" />
        </Pressable>
      </View>
      <View style={s.reelCopy}>
        <Text style={s.reelAuthor}>@{post.author?.handle ?? "user"}</Text>
        <Text style={s.reelBody}>{post.body}</Text>
      </View>
    </View>
  );
}
function Sheet({
  visible,
  close,
  title,
  children,
}: {
  visible: boolean;
  close(): void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <Pressable style={s.scrim} onPress={close} />
      <View style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>{title}</Text>
          <Pressable onPress={close}>
            <Ionicons name="close" size={24} color={palette.muted} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}
function RowIcon({
  name,
  accent,
  danger,
}: {
  name: keyof typeof Ionicons.glyphMap;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={[s.rowIcon, danger && s.dangerIcon]}>
      <Ionicons
        name={name}
        size={22}
        color={danger ? "#ff7568" : accent ? palette.accent : palette.text}
      />
    </View>
  );
}
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "P";
const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}K`
      : String(n);
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const touchDistance = (touches: readonly { pageX: number; pageY: number }[]) =>
  touches.length < 2
    ? 1
    : Math.hypot(
        touches[1]!.pageX - touches[0]!.pageX,
        touches[1]!.pageY - touches[0]!.pageY,
      );
const replacePost = (items: FeedPost[], updated: FeedPost, append = false) =>
  items.some((item) => item.id === updated.id)
    ? items.map((item) => (item.id === updated.id ? updated : item))
    : append
      ? [updated, ...items]
      : items;
const togglePollOptions = (post: FeedPost, optionId: string) => {
  const selected =
    post.poll?.options
      .filter((item) => item.viewerSelected)
      .map((item) => item.id) ?? [];
  return selected.includes(optionId)
    ? selected.filter((id) => id !== optionId)
    : [...selected, optionId];
};
function relativeTime(value: string) {
  const seconds = Math.max(
    1,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  return seconds < 60
    ? `${seconds}s`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h`
        : `${Math.floor(seconds / 86400)}d`;
}

const s = StyleSheet.create({
  feedViewerList: { paddingBottom: 42 },
  feedCard: {
    backgroundColor: palette.background,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
  },
  feedAuthorRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  feedAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  feedAvatarText: { color: palette.accent, fontWeight: "900" },
  feedHandle: { color: palette.muted, fontSize: 12, marginTop: 2 },
  feedBody: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 13,
  },
  feedActions: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.borderSoft,
    marginTop: 13,
  },
  feedAction: { flexDirection: "row", alignItems: "center", gap: 6 },
  feedComments: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  profileMedia: {
    marginTop: 14,
    width: "100%",
    aspectRatio: 1,
    backgroundColor: palette.surfaceStrong,
    overflow: "hidden",
  },
  document: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  mediaBadge: {
    position: "absolute",
    right: 10,
    top: 10,
    backgroundColor: "rgba(0,0,0,.7)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mediaBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  profilePoll: { gap: 9, marginTop: 14 },
  pollTitle: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 2,
  },
  pollOption: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    overflow: "hidden",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  pollSelected: { borderColor: palette.accent },
  pollFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(191,255,70,.18)",
  },
  pollLabel: { color: palette.text, fontWeight: "800" },
  pollPercent: {
    position: "absolute",
    right: 13,
    color: palette.accent,
    fontWeight: "900",
  },
  pollMeta: { color: palette.muted, fontSize: 11 },
  reelViewer: { backgroundColor: "#000" },
  reelShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,.08)",
  },
  reelRail: {
    position: "absolute",
    right: 15,
    bottom: 105,
    alignItems: "center",
    gap: 23,
  },
  reelButton: { alignItems: "center", gap: 3 },
  reelCount: { color: "#fff", fontSize: 11, fontWeight: "800" },
  reelCopy: { position: "absolute", left: 18, right: 78, bottom: 30 },
  reelMenu: {
    position: "absolute",
    top: 18,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  reelAuthor: { color: "#fff", fontSize: 16, fontWeight: "900" },
  reelBody: { color: "#fff", fontSize: 14, lineHeight: 20, marginTop: 8 },
  safe: { flex: 1, backgroundColor: palette.background },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    height: 58,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  accountSwitch: {
    maxWidth: "62%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    height: 42,
  },
  handle: { color: palette.text, fontSize: 17, fontWeight: "900" },
  content: { paddingBottom: 90 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 22,
    gap: 7,
  },
  avatarWrap: { marginRight: 7 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: palette.accent,
    backgroundColor: palette.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: { color: palette.accent, fontSize: 20, fontWeight: "900" },
  avatarAdd: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.accent,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stat: { flex: 1, minWidth: 46, alignItems: "center" },
  statValue: { color: palette.text, fontSize: 17, fontWeight: "900" },
  statLabel: { color: palette.muted, fontSize: 9, marginTop: 3 },
  identity: { paddingHorizontal: 18, paddingTop: 14 },
  display: { color: palette.text, fontSize: 16, fontWeight: "900" },
  username: { color: palette.muted, fontSize: 12, marginTop: 3 },
  bio: { color: palette.text, marginTop: 8, lineHeight: 19 },
  website: { color: "#9dc8ff", fontSize: 13, fontWeight: "700", marginTop: 5 },
  profileActions: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 15,
  },
  action: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { color: palette.text, fontSize: 12, fontWeight: "800" },
  smallAction: {
    width: 40,
    height: 38,
    borderRadius: 10,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  highlights: { paddingHorizontal: 17, paddingVertical: 18 },
  highlight: { alignItems: "center", width: 72 },
  highlightCircle: {
    width: 61,
    height: 61,
    borderRadius: 31,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1.5,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  highlightVideo: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceStrong,
  },
  highlightViewer: { flex: 1, backgroundColor: "#000" },
  highlightHead: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,.28)",
  },
  highlightLabel: { color: palette.text, fontSize: 11, marginTop: 7 },
  tabs: {
    height: 51,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderSoft,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  activeTab: { borderBottomWidth: 2, borderBottomColor: palette.accent },
  gridRow: { gap: 2, marginBottom: 2 },
  tile: {
    flex: 1 / 3,
    maxWidth: "33.34%",
    aspectRatio: 1,
    backgroundColor: palette.surfaceStrong,
    overflow: "hidden",
  },
  textTile: { flex: 1, padding: 10, justifyContent: "center" },
  tileText: {
    color: palette.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  tilePlay: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,.58)",
    alignItems: "center",
    justifyContent: "center",
  },
  multi: { position: "absolute", top: 7, left: 7 },
  empty: { alignItems: "center", paddingHorizontal: 40, paddingVertical: 54 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 18,
  },
  emptyCopy: {
    color: palette.muted,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 7,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,.68)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "84%",
    backgroundColor: palette.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#58616e",
    marginTop: 10,
  },
  sheetHead: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: { color: palette.text, fontSize: 20, fontWeight: "900" },
  row: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.borderSoft,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1 },
  rowLabel: { flex: 1, color: palette.text, fontSize: 15, fontWeight: "800" },
  rowHint: { color: palette.muted, fontSize: 11, marginTop: 2 },
  dangerIcon: { backgroundColor: palette.surface },
  danger: { color: "#ff7568", fontSize: 15, fontWeight: "800" },
  accountRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  miniAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: palette.accent,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    minHeight: 94,
    maxHeight: 150,
    borderRadius: 15,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    color: palette.text,
    padding: 14,
    textAlignVertical: "top",
    fontSize: 15,
  },
  sources: { flexDirection: "row", gap: 10, marginTop: 14 },
  source: {
    flex: 1,
    minHeight: 112,
    borderRadius: 17,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceTitle: { color: palette.text, fontWeight: "900", marginTop: 8 },
  preview: {
    height: 190,
    marginTop: 14,
    borderRadius: 17,
    backgroundColor: palette.background,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  ready: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.accent,
  },
  readyText: { color: palette.onAccent, fontSize: 11, fontWeight: "900" },
  publish: {
    height: 50,
    borderRadius: 16,
    marginTop: 16,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  publishText: { color: palette.onAccent, fontWeight: "900" },
  disabled: { opacity: 0.35 },
  cameraPage: { flex: 1, backgroundColor: "#000" },
  cameraOverlay: { flex: 1, padding: 20, justifyContent: "space-between" },
  cameraModes: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    marginTop: "auto",
    marginBottom: 20,
  },
  cameraMode: { color: palette.muted, fontWeight: "900" },
  cameraActive: { color: palette.accent },
  shutter: {
    alignSelf: "center",
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: "#fff",
    padding: 5,
    marginBottom: 20,
  },
  shutterInner: { flex: 1, borderRadius: 32, backgroundColor: "#fff" },
  recording: { borderColor: "#ff4f60" },
  editPage: { flex: 1, backgroundColor: palette.background },
  editHead: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
  },
  editTitle: { color: palette.text, fontSize: 17, fontWeight: "900" },
  done: { color: palette.accent, fontSize: 15, fontWeight: "900" },
  editBody: { padding: 20, gap: 16 },
  editField: { gap: 7 },
  editLabel: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  editInput: {
    height: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    color: palette.text,
    fontSize: 15,
  },
  editMultiline: { height: 105, paddingTop: 14, textAlignVertical: "top" },
  availability: { color: palette.muted, fontSize: 12, marginTop: -9 },
  available: { color: palette.accent },
  unavailable: { color: "#ff7468" },
  optional: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  framePage: { flex: 1, backgroundColor: palette.mediaBackground },
  frameStage: {
    width: "100%",
    aspectRatio: 1,
    marginTop: 38,
    overflow: "hidden",
    backgroundColor: palette.surfaceStrong,
  },
  cropRing: {
    position: "absolute",
    width: "82%",
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: palette.accent,
    alignSelf: "center",
    top: "9%",
    left: "9%",
    shadowColor: "#000",
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  zoomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 34,
    marginTop: 25,
  },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#343b46",
    overflow: "hidden",
  },
  zoomFill: { height: "100%", backgroundColor: palette.accent },
  frameActions: {
    paddingHorizontal: 38,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resetText: { color: palette.accent, fontWeight: "800" },
  zoomText: { color: palette.muted, fontWeight: "800" },
  frameHint: {
    color: palette.muted,
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 32,
    marginTop: 22,
  },
  viewer: { flex: 1, backgroundColor: palette.mediaBackground },
  feedViewerBackground:{backgroundColor:palette.background},
  reelViewerBackground:{backgroundColor:palette.mediaBackground},
  feedViewerAuthor:{color:palette.text,fontSize:15,fontWeight:"900"},
  viewerHead: {
    height: 78,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
  },
  viewerTitle: { color: "#fff", fontWeight: "900", fontSize: 17 },
  viewerPost: {
    backgroundColor: palette.mediaBackground,
    justifyContent: "center",
  },
  viewerMedia: { width: "100%", height: "68%", backgroundColor: "#000" },
  viewerCopy: { padding: 18 },
  viewerAuthor: { color: "#fff", fontSize: 15, fontWeight: "900" },
  viewerBody: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  viewerActions: {
    height: 46,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewerCount: { color: palette.text, marginRight: 14 },
});
