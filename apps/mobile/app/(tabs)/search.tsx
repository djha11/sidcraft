import { palette } from "../../src/theme";
import { Ionicons } from "@expo/vector-icons";
import type {
  FeedAuthor,
  FeedPost,
  SearchResults,
  TrendingTopic,
} from "@pulse/contracts";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { VerifiedName } from "../../src/verified-name";

type Tab = "top" | "people" | "posts" | "reels" | "tags";
type Result =
  | { type: "person"; value: FeedAuthor }
  | { type: "post" | "reel"; value: FeedPost }
  | { type: "tag"; value: TrendingTopic };
const empty: SearchResults = { people: [], posts: [], reels: [], topics: [] };

export default function Search() {
  const auth = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("top");
  const [results, setResults] = useState<SearchResults>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2 || !auth.accessToken) {
      setResults(empty);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () =>
        api
          .search(value, auth.accessToken!)
          .then(setResults)
          .catch(() => setError("Search is unavailable. Try again."))
          .finally(() => setLoading(false)),
      300,
    );
    return () => clearTimeout(timer);
  }, [query, auth.accessToken]);
  const data = useMemo<Result[]>(() => {
    const people = results.people.map((value) => ({
      type: "person" as const,
      value,
    }));
    const posts = results.posts.map((value) => ({
      type: "post" as const,
      value,
    }));
    const reels = results.reels.map((value) => ({
      type: "reel" as const,
      value,
    }));
    const tags = results.topics.map((value) => ({
      type: "tag" as const,
      value,
    }));
    if (tab === "people") return people;
    if (tab === "posts") return posts;
    if (tab === "reels") return reels;
    if (tab === "tags") return tags;
    return [
      ...people.slice(0, 4),
      ...tags.slice(0, 4),
      ...posts.slice(0, 8),
      ...reels.slice(0, 8),
    ];
  }, [results, tab]);
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brand}>● SidCraft</Text>
        <Text style={styles.title}>Search</Text>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={palette.muted} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
          placeholder="Search people, posts, reels and #topics"
          placeholderTextColor={palette.muted}
          style={styles.input}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={20} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.tabs}>
        {(["top", "people", "posts", "reels", "tags"] as Tab[]).map((value) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, tab === value && styles.tabTextActive]}
            >
              {value[0]!.toUpperCase() + value.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) =>
          `${item.type}:${"id" in item.value ? item.value.id : item.value.tag}`
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          loading ? (
            <ActivityIndicator color={palette.accent} style={styles.loading} />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons
                name={
                  query.trim().length < 2
                    ? "search-outline"
                    : "sparkles-outline"
                }
                size={42}
                color={palette.muted}
              />
              <Text style={styles.emptyTitle}>
                {query.trim().length < 2
                  ? "Find what matters to you"
                  : "No matching results"}
              </Text>
              <Text style={styles.emptyBody}>
                {query.trim().length < 2
                  ? "Search by name, @username, words, or hashtags."
                  : "Try another name, word, or hashtag."}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          item.type === "person" ? (
            <PersonResult
              person={item.value}
              onPress={() =>
                router.push({
                  pathname: "/user-profile" as never,
                  params: { userId: item.value.id },
                })
              }
            />
          ) : item.type === "tag" ? (
            <TagResult
              topic={item.value}
              onPress={() =>
                router.push({
                  pathname: "/trending",
                  params: { tag: item.value.tag },
                })
              }
            />
          ) : (
            <PostResult post={item.value} reel={item.type === "reel"} />
          )
        }
      />
    </SafeAreaView>
  );
}

function PersonResult({
  person,
  onPress,
}: {
  person: FeedAuthor;
  onPress(): void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {person.displayName.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.flex}>
        <VerifiedName
          name={person.displayName}
          type={person.verificationType}
          textStyle={styles.name}
        />
        <Text style={styles.handle}>@{person.handle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={palette.muted} />
    </Pressable>
  );
}
function TagResult({
  topic,
  onPress,
}: {
  topic: TrendingTopic;
  onPress(): void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.hash}>
        <Text style={styles.hashText}>#</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.name}>{topic.tag}</Text>
        <Text style={styles.handle}>
          {topic.postCount} posts · {topic.reelCount} reels
        </Text>
      </View>
      <Ionicons name="trending-up" size={20} color={palette.accent} />
    </Pressable>
  );
}
function PostResult({ post, reel }: { post: FeedPost; reel: boolean }) {
  const media = post.media[0];
  return (
    <View style={styles.post}>
      <View style={styles.postHead}>
        <View style={styles.miniAvatar}>
          <Text style={styles.avatarText}>
            {post.author?.displayName.slice(0, 1).toUpperCase() ?? "?"}
          </Text>
        </View>
        <View style={styles.flex}>
          <VerifiedName
            name={post.author?.displayName ?? "Anonymous"}
            type={post.author?.verificationType}
            textStyle={styles.name}
          />
          <Text style={styles.handle}>
            {post.author ? `@${post.author.handle}` : "Identity protected"}
          </Text>
        </View>
        {reel ? (
          <View style={styles.reelBadge}>
            <Ionicons name="play" size={11} color={palette.onAccent} />
            <Text style={styles.reelText}>REEL</Text>
          </View>
        ) : null}
      </View>
      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
      {media?.kind === "image" ? (
        <Image source={{ uri: api.mediaUrl(media.url) }} style={styles.media} />
      ) : media?.kind === "video" ? (
        <View style={styles.video}>
          <Ionicons name="play-circle" size={46} color={palette.text} />
        </View>
      ) : null}
      <View style={styles.metrics}>
        <Text style={styles.metric}>♡ {post.likeCount}</Text>
        <Text style={styles.metric}>◯ {post.commentCount}</Text>
        <Text style={styles.metric}>↻ {post.repostCount}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  header: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { color: palette.text, fontSize: 20, fontWeight: "900" },
  title: { color: palette.text, fontWeight: "800" },
  searchBox: {
    height: 50,
    marginHorizontal: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: { flex: 1, color: palette.text, fontSize: 14 },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 10,
    marginTop: 12,
    borderBottomWidth: 1,
    borderColor: palette.borderSoft,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderColor: "transparent",
  },
  tabActive: { borderColor: palette.accent },
  tabText: { color: palette.muted, fontSize: 11, fontWeight: "800" },
  tabTextActive: { color: palette.text },
  list: { paddingBottom: 30 },
  loading: { padding: 24 },
  error: { color: "#ff7668", padding: 18 },
  empty: { alignItems: "center", paddingHorizontal: 45, paddingTop: 100 },
  emptyTitle: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 19,
    marginTop: 16,
  },
  emptyBody: {
    color: palette.muted,
    textAlign: "center",
    marginTop: 7,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderBottomWidth: 1,
    borderColor: palette.borderSoft,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1.5,
    borderColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: palette.accent, fontWeight: "900" },
  flex: { flex: 1 },
  name: { color: palette.text, fontWeight: "800", fontSize: 14 },
  handle: { color: palette.muted, fontSize: 11, marginTop: 3 },
  hash: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  hashText: { color: palette.accent, fontSize: 22, fontWeight: "900" },
  post: { padding: 15, borderBottomWidth: 1, borderColor: palette.borderSoft },
  postHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  miniAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { color: palette.text, fontSize: 14, lineHeight: 20, marginTop: 10 },
  media: {
    width: "100%",
    aspectRatio: 1.5,
    borderRadius: 14,
    marginTop: 11,
    backgroundColor: palette.surface,
  },
  video: {
    width: "100%",
    aspectRatio: 1.3,
    borderRadius: 14,
    marginTop: 11,
    backgroundColor: palette.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  reelBadge: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
  },
  reelText: { color: palette.onAccent, fontWeight: "900", fontSize: 9 },
  metrics: { flexDirection: "row", gap: 22, marginTop: 12 },
  metric: { color: palette.muted, fontSize: 12 },
});
