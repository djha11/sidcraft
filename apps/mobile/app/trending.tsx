import { palette } from "../src/theme";
import { Ionicons } from "@expo/vector-icons";
import type { FeedPost, TrendingTopic } from "@pulse/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api";
import { useAuth } from "../src/auth";

type Kind = "all" | "posts" | "reels";

export default function TrendingScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ tag?: string }>();
  const [kind, setKind] = useState<Kind>("all");
  const [tag, setTag] = useState(
    typeof params.tag === "string" ? params.tag : "",
  );
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [items, setItems] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!auth.accessToken) return;
    try {
      setError("");
      const result = await api.trending(
        auth.accessToken,
        kind,
        tag || undefined,
      );
      setTopics(result.topics);
      setItems(result.items);
    } catch {
      setError("Could not load what is trending right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [auth.accessToken, kind, tag]);
  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.accent}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Pressable
                accessibilityLabel="Back"
                onPress={() => router.back()}
                style={styles.headerButton}
              >
                <Ionicons name="arrow-back" size={24} color={palette.text} />
              </Pressable>
              <View style={styles.titleWrap}>
                <Text style={styles.title}>Trending on SidCraft</Text>
                <Text style={styles.subtitle}>
                  What people are talking about now
                </Text>
              </View>
              <View style={styles.headerButton} />
            </View>
            <View style={styles.segments}>
              {(["all", "posts", "reels"] as Kind[]).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setKind(value)}
                  style={[
                    styles.segment,
                    kind === value && styles.segmentActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      kind === value && styles.segmentTextActive,
                    ]}
                  >
                    {value[0]!.toUpperCase() + value.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.topicHeader}>
              <Text style={styles.topicTitle}>Explore hashtags</Text>
              {tag ? (
                <Pressable onPress={() => setTag("")}>
                  <Text style={styles.clear}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.topicRow}
            >
              {topics.map((topic, index) => {
                const active =
                  tag.toLocaleLowerCase() === topic.tag.toLocaleLowerCase();
                return (
                  <Pressable
                    key={topic.tag.toLocaleLowerCase()}
                    onPress={() => setTag(active ? "" : topic.tag)}
                    style={[styles.topic, active && styles.topicActive]}
                  >
                    <Text style={styles.topicRank}>{index + 1}</Text>
                    <View>
                      <Text
                        style={[
                          styles.topicTag,
                          active && styles.topicTagActive,
                        ]}
                      >
                        {topic.tag}
                      </Text>
                      <Text style={styles.topicCount}>
                        {topic.postCount} posts · {topic.reelCount} reels
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.resultsTitle}>
              {tag || (kind === "all" ? "Trending now" : `Trending ${kind}`)}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading ? (
              <ActivityIndicator color={palette.accent} style={styles.loader} />
            ) : null}
          </>
        }
        renderItem={({ item }) => <TrendingPost post={item} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons
                name="trending-up-outline"
                size={34}
                color={palette.muted}
              />
              <Text style={styles.emptyTitle}>Nothing trending here yet</Text>
              <Text style={styles.emptyText}>
                Posts with active conversations and hashtags will appear here.
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function TrendingPost({ post }: { post: FeedPost }) {
  const first = post.media[0];
  return (
    <View style={styles.post}>
      <View style={styles.authorRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {post.author?.displayName.slice(0, 1).toUpperCase() ?? "?"}
          </Text>
        </View>
        <View style={styles.authorText}>
          <Text style={styles.name}>
            {post.author?.displayName ?? "Anonymous"}
          </Text>
          <Text style={styles.handle}>
            {post.author ? `@${post.author.handle}` : "Identity protected"} ·{" "}
            {relative(post.createdAt)}
          </Text>
        </View>
        {first?.kind === "video" ? (
          <View style={styles.reelBadge}>
            <Ionicons name="play" size={10} color={palette.onAccent} />
            <Text style={styles.reelBadgeText}>REEL</Text>
          </View>
        ) : null}
        <Ionicons name="ellipsis-horizontal" size={20} color={palette.muted} />
      </View>
      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
      {first?.kind === "image" ? (
        <Image
          source={{ uri: api.mediaUrl(first.url) }}
          resizeMode="cover"
          style={styles.media}
        />
      ) : null}
      {first?.kind === "video" ? (
        <View style={styles.video}>
          <Ionicons name="play-circle" size={54} color={palette.text} />
          <Text style={styles.videoText}>Trending reel</Text>
        </View>
      ) : null}
      {post.poll ? (
        <View style={styles.poll}>
          <Text style={styles.pollQuestion}>{post.poll.question}</Text>
          {post.poll.options.map((option) => (
            <View key={option.id} style={styles.pollOption}>
              <Text style={styles.pollLabel}>{option.label}</Text>
              <Text style={styles.pollPercent}>{option.percentage}%</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Action
          icon={post.viewerLiked ? "heart" : "heart-outline"}
          count={post.likeCount}
          active={post.viewerLiked}
        />
        <Action icon="chatbubble-outline" count={post.commentCount} />
        <Action icon="repeat-outline" count={post.repostCount} />
        <Ionicons name="paper-plane-outline" size={20} color={palette.muted} />
      </View>
    </View>
  );
}
function Action({
  icon,
  count,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  active?: boolean;
}) {
  return (
    <View style={styles.action}>
      <Ionicons
        name={icon}
        size={20}
        color={active ? "#ff5374" : palette.muted}
      />
      <Text style={styles.actionText}>{count}</Text>
    </View>
  );
}
function relative(value: string) {
  const seconds = Math.max(1, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  header: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: palette.borderSoft,
    paddingHorizontal: 12,
  },
  headerButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { flex: 1, alignItems: "center" },
  title: { color: palette.text, fontSize: 18, fontWeight: "900" },
  subtitle: { color: palette.muted, fontSize: 10, marginTop: 2 },
  segments: {
    margin: 14,
    padding: 4,
    borderRadius: 16,
    backgroundColor: palette.surfaceStrong,
    flexDirection: "row",
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 12,
  },
  segmentActive: { backgroundColor: palette.accent },
  segmentText: { color: palette.muted, fontWeight: "800", fontSize: 13 },
  segmentTextActive: { color: palette.onAccent },
  topicHeader: {
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  topicTitle: { color: palette.text, fontSize: 15, fontWeight: "800" },
  clear: { color: palette.accent, fontWeight: "700", fontSize: 12 },
  topicRow: { gap: 9, padding: 11, paddingHorizontal: 16 },
  topic: {
    minWidth: 155,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: palette.surface,
    borderRadius: 14,
    padding: 11,
  },
  topicActive: {
    borderColor: palette.accent,
    backgroundColor: palette.surface,
  },
  topicRank: { color: "#687284", fontWeight: "800", fontSize: 11 },
  topicTag: { color: palette.text, fontWeight: "900", fontSize: 14 },
  topicTagActive: { color: palette.accent },
  topicCount: { color: palette.muted, fontSize: 10, marginTop: 3 },
  resultsTitle: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 11,
  },
  loader: { padding: 35 },
  error: { color: "#ff7869", margin: 16 },
  post: { padding: 16, borderTopWidth: 1, borderColor: palette.borderSoft },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: palette.accent, fontWeight: "900" },
  authorText: { flex: 1 },
  name: { color: palette.text, fontWeight: "800", fontSize: 14 },
  handle: { color: palette.muted, fontSize: 11, marginTop: 2 },
  reelBadge: {
    backgroundColor: palette.accent,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  reelBadgeText: { color: palette.onAccent, fontWeight: "900", fontSize: 9 },
  body: { color: palette.text, fontSize: 15, lineHeight: 21, marginTop: 12 },
  media: {
    width: "100%",
    aspectRatio: 1.35,
    borderRadius: 16,
    marginTop: 12,
    backgroundColor: "#121722",
  },
  video: {
    width: "100%",
    aspectRatio: 0.86,
    maxHeight: 520,
    borderRadius: 16,
    marginTop: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  videoText: { color: palette.muted, marginTop: 6, fontWeight: "700" },
  poll: { marginTop: 12, gap: 7 },
  pollQuestion: { color: palette.text, fontWeight: "800", marginBottom: 3 },
  pollOption: {
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 12,
    padding: 11,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pollLabel: { color: palette.text, fontWeight: "700" },
  pollPercent: { color: palette.accent, fontWeight: "900" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingHorizontal: 4,
  },
  action: { flexDirection: "row", gap: 6, alignItems: "center" },
  actionText: { color: palette.muted, fontSize: 12 },
  empty: { alignItems: "center", padding: 50 },
  emptyTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 12,
  },
  emptyText: {
    color: palette.muted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
});
