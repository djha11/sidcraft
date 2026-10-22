import { palette } from "../src/theme";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  IndiaRegion,
  LocationProfile,
  LokSabhaConstituency,
  Poll,
  VoteRequest,
} from "@pulse/contracts";
import { useAuth } from "../src/auth";
import { api } from "../src/api";

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");
export default function Pulse() {
  const auth = useAuth();
  const router = useRouter();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [regions, setRegions] = useState<IndiaRegion[]>([]);
  const [constituencies, setConstituencies] = useState<LokSabhaConstituency[]>(
    [],
  );
  const [location, setLocation] = useState<LocationProfile | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  async function loadPoll() {
    if (auth.accessToken) setPoll(await api.featuredPoll(auth.accessToken));
  }
  useEffect(() => {
    if (auth.accessToken)
      loadPoll().catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "LOAD_FAILED"),
      );
    api
      .regions()
      .then(setRegions)
      .catch(() => undefined);
  }, [auth.accessToken]);
  if (!auth.loading && !auth.accessToken) return <Redirect href="/login" />;
  if (!poll)
    return (
      <SafeAreaView style={x.safe}>
        {error ? (
          <View style={x.emptyState}>
            <Text style={x.brand}>● SidCraft</Text>
            <Text style={x.emptyTitle}>You’re all caught up</Text>
            <Text style={x.emptyCopy}>
              There isn’t an active question for you right now. Explore every
              SidCraft section below.
            </Text>
            <DashboardLinks onOpen={(route) => router.push(route)} />
            <Pressable
              onPress={() => {
                setError("");
                void loadPoll().catch((e: unknown) =>
                  setError(e instanceof Error ? e.message : "LOAD_FAILED"),
                );
              }}
              style={x.retry}
            >
              <Text style={x.retryText}>Check again</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator style={{ flex: 1 }} color={palette.accent} />
        )}
      </SafeAreaView>
    );
  const currentPoll = poll;

  async function saveRegion(
    region: IndiaRegion,
    source: "device" | "manual",
    constituencyCode: string | null = null,
  ) {
    if (!auth.accessToken) return;
    const profile = await api.saveLocation(
      {
        consent: true,
        source,
        stateCode: region.code,
        lokSabhaConstituencyCode: constituencyCode,
      },
      auth.accessToken,
    );
    setLocation(profile);
    setConstituencies(await api.constituencies(region.code));
    setSelected(null);
    setAnswer("");
    setComment("");
    await loadPoll();
  }
  async function useDeviceLocation() {
    setGeoBusy(true);
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error("LOCATION_PERMISSION_DENIED");
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [place] = await Location.reverseGeocodeAsync(position.coords);
      const regionName = place?.region ?? place?.subregion ?? "";
      const normalized = normalize(regionName);
      const region = regions.find(
        (item) =>
          normalize(item.name) === normalized ||
          (normalized.includes("delhi") && item.code === "DL"),
      );
      if (!region) throw new Error("REGION_NOT_RECOGNIZED");
      await saveRegion(region, "device");
    } catch (e) {
      setError(e instanceof Error ? e.message : "LOCATION_FAILED");
    } finally {
      setGeoBusy(false);
    }
  }
  async function refineConstituency(item: LokSabhaConstituency) {
    const region = regions.find((value) => value.code === item.stateCode);
    if (!region) return;
    setGeoBusy(true);
    try {
      await saveRegion(region, "manual", item.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "LOCATION_FAILED");
    } finally {
      setGeoBusy(false);
    }
  }
  async function submitVote() {
    if (!auth.accessToken || currentPoll.viewerHasVoted) return;
    const input: VoteRequest = {
      ...(selected ? { optionId: selected } : {}),
      ...(answer.trim() ? { answer: answer.trim() } : {}),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    };
    setBusy(true);
    setError("");
    try {
      setPoll(await api.vote(currentPoll.id, input, auth.accessToken));
      setAnswer("");
      setComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "VOTE_FAILED");
    } finally {
      setBusy(false);
    }
  }
  const canSubmit =
    !poll.viewerHasVoted &&
    !busy &&
    (poll.responseType === "choice"
      ? selected !== null
      : answer.trim().length > 0) &&
    (poll.commentMode !== "required" || comment.trim().length > 0);

  return (
    <SafeAreaView style={x.safe}>
      <ScrollView
        contentContainerStyle={x.page}
        keyboardShouldPersistTaps="handled"
      >
        <View style={x.header}>
          <Text style={x.logo}>● SidCraft</Text>
          <Pressable accessibilityRole="button" onPress={auth.logout}>
            <Text style={x.logout}>Sign out</Text>
          </Pressable>
        </View>
        <DashboardLinks onOpen={(route) => router.push(route)} compact />
        <View style={x.locationCard}>
          <View style={{ flex: 1 }}>
            <Text style={x.locationTitle}>
              {location
                ? `Personalized for ${location.lokSabhaConstituencyName ?? location.stateName}`
                : "Personalize your civic polls"}
            </Text>
            <Text style={x.locationNote}>
              Location is optional. Precise coordinates stay off our servers.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={geoBusy}
            onPress={useDeviceLocation}
            style={x.locationButton}
          >
            <Text style={x.locationButtonText}>
              {geoBusy ? "Finding…" : "Use location"}
            </Text>
          </Pressable>
        </View>
        {constituencies.length && location?.precision === "state" ? (
          <View>
            <Text style={x.refine}>
              Optional: choose your Lok Sabha constituency
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {constituencies.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => refineConstituency(item)}
                  key={item.code}
                  style={x.chip}
                >
                  <Text style={x.chipText}>
                    {item.number}. {item.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        <Text style={x.eyebrow}>
          {poll.target.scope === "india"
            ? "QUESTION FOR INDIA"
            : "QUESTION FOR YOUR AREA"}
        </Text>
        <Text style={x.title}>What do you{`\n`}think today?</Text>
        <View style={x.card}>
          <Text style={x.topic}>{poll.topic}</Text>
          <Text style={x.question}>{poll.question}</Text>
          {poll.media?.kind === "image" ? (
            <Image
              source={{ uri: poll.media.url }}
              resizeMode="cover"
              style={x.pollMedia}
            />
          ) : poll.media ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void Linking.openURL(poll.media!.url)}
              style={x.videoMedia}
            >
              <Text style={x.videoMediaIcon}>▶</Text>
              <Text style={x.videoMediaText}>Open opinion video</Text>
            </Pressable>
          ) : null}
          {poll.responseType === "choice" ? (
            poll.options.map((o) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{
                  selected: selected === o.id || poll.selectedOptionId === o.id,
                }}
                disabled={busy || poll.viewerHasVoted}
                onPress={() => setSelected(o.id)}
                key={o.id}
                style={[
                  x.option,
                  (selected === o.id || poll.selectedOptionId === o.id) &&
                    x.selected,
                ]}
              >
                <View
                  style={[
                    x.fill,
                    {
                      width: poll.viewerHasVoted
                        ? `${o.percentage ?? 0}%`
                        : "0%",
                    },
                  ]}
                />
                {o.mediaUrl ? (
                  <Image source={{ uri: o.mediaUrl }} style={x.optionImage} />
                ) : null}
                <Text style={x.label}>{o.label}</Text>
                {poll.viewerHasVoted ? (
                  <Text style={x.pct}>{o.percentage}%</Text>
                ) : null}
              </Pressable>
            ))
          ) : (
            <TextInput
              accessibilityLabel="Your private answer"
              editable={!poll.viewerHasVoted}
              value={answer}
              onChangeText={setAnswer}
              multiline
              placeholder="Write your answer…"
              placeholderTextColor={palette.muted}
              style={[x.input, x.answerInput]}
            />
          )}
          {poll.commentMode !== "disabled" && !poll.viewerHasVoted ? (
            <TextInput
              accessibilityLabel="Optional vote comment"
              value={comment}
              onChangeText={setComment}
              multiline
              placeholder={
                poll.commentMode === "required"
                  ? "Why? (required)"
                  : "Why? (optional)"
              }
              placeholderTextColor={palette.muted}
              style={x.input}
            />
          ) : null}
          {!poll.viewerHasVoted ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={submitVote}
              style={[x.submit, !canSubmit && x.submitDisabled]}
            >
              <Text style={x.submitText}>
                {busy ? "Submitting…" : "Submit privately"}
              </Text>
            </Pressable>
          ) : null}
          <Text style={x.responses}>
            {poll.responseCount} responses · Anonymous
          </Text>
        </View>
        <Text style={x.note}>
          {poll.viewerHasVoted
            ? poll.responseType === "choice"
              ? "Your response is recorded. Aggregate percentages are now visible."
              : "Your private answer is recorded. It will never appear in the public app."
            : "Open answers and vote comments are private. Restricted analytics never includes your identity, choice, precise location, or exact submission time."}
        </Text>
        {error ? <Text style={x.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const dashboardItems = [
  { label: "Feed", note: "Posts, stories and live", icon: "home-outline", route: "/feed" },
  { label: "Reels & News", note: "Watch and discover", icon: "play-circle-outline", route: "/news" },
  { label: "Chat", note: "Messages and calls", icon: "chatbubble-ellipses-outline", route: "/chat" },
  { label: "Search", note: "People and content", icon: "search-outline", route: "/search" },
  { label: "Profile", note: "Your posts and settings", icon: "person-outline", route: "/profile" },
] as const;

function DashboardLinks({
  onOpen,
  compact = false,
}: {
  onOpen(route: "/feed" | "/news" | "/chat" | "/search" | "/profile"): void;
  compact?: boolean;
}) {
  return (
    <View style={[x.dashboard, compact && x.dashboardCompact]}>
      {dashboardItems.map((item) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.label}`}
          key={item.route}
          onPress={() => onOpen(item.route)}
          style={x.dashboardCard}
        >
          <View style={x.dashboardIcon}>
            <Ionicons name={item.icon} size={22} color={palette.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={x.dashboardLabel}>{item.label}</Text>
            <Text style={x.dashboardNote}>{item.note}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.muted} />
        </Pressable>
      ))}
    </View>
  );
}

const x = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  page: { padding: 20, paddingBottom: 44 },
  header: {
    height: 60,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { color: palette.text, fontSize: 20, fontWeight: "800" },
  logout: { color: palette.muted },
  dashboard: {
    width: "100%",
    maxWidth: 920,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginVertical: 24,
  },
  dashboardCompact: { marginTop: 4, marginBottom: 18 },
  dashboardCard: {
    flexGrow: 1,
    flexBasis: 240,
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: palette.surfaceStrong,
  },
  dashboardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  dashboardLabel: { color: palette.text, fontSize: 15, fontWeight: "800" },
  dashboardNote: { color: palette.muted, fontSize: 11, marginTop: 3 },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.surfaceStrong,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  locationTitle: { color: palette.text, fontWeight: "700" },
  locationNote: {
    color: palette.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  locationButton: {
    backgroundColor: palette.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  locationButtonText: {
    color: palette.accent,
    fontWeight: "800",
    fontSize: 12,
  },
  refine: {
    color: palette.muted,
    fontSize: 11,
    marginTop: 12,
    marginBottom: 8,
  },
  chip: {
    borderColor: palette.borderSoft,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 99,
    marginRight: 7,
  },
  chipText: { color: palette.text, fontSize: 12 },
  eyebrow: {
    color: palette.accent,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "800",
    marginTop: 24,
  },
  title: {
    color: palette.text,
    fontSize: 36,
    lineHeight: 39,
    fontWeight: "800",
    marginVertical: 8,
  },
  card: {
    backgroundColor: palette.surfaceStrong,
    borderColor: palette.borderSoft,
    borderWidth: 1,
    borderRadius: 26,
    padding: 20,
    marginTop: 22,
  },
  topic: { color: palette.accent, fontSize: 12, fontWeight: "700" },
  pollMedia: {
    width: "100%",
    height: 210,
    borderRadius: 16,
    backgroundColor: palette.surface,
    marginTop: 16,
  },
  videoMedia: {
    height: 150,
    borderRadius: 16,
    marginTop: 16,
    backgroundColor: palette.text,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  videoMediaIcon: { color: "#fff", fontSize: 30 },
  videoMediaText: { color: "#fff", fontWeight: "800" },
  question: {
    color: palette.text,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "700",
    marginVertical: 22,
  },
  option: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 16,
    marginBottom: 10,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  optionImage: {
    width: 42,
    height: 42,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: palette.surface,
  },
  selected: { borderColor: palette.accent },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: palette.accentSoft,
  },
  label: {
    color: palette.text,
    fontWeight: "600",
    flex: 1,
    paddingVertical: 12,
  },
  pct: { color: palette.accent, fontWeight: "800" },
  input: {
    color: palette.text,
    borderColor: palette.borderSoft,
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 72,
    padding: 14,
    textAlignVertical: "top",
    marginTop: 8,
  },
  answerInput: { minHeight: 130 },
  submit: {
    backgroundColor: palette.accent,
    minHeight: 52,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  submitDisabled: { opacity: 0.35 },
  submitText: { color: palette.onAccent, fontWeight: "900" },
  responses: {
    color: palette.muted,
    fontSize: 11,
    textAlign: "right",
    marginTop: 12,
  },
  note: {
    color: palette.muted,
    lineHeight: 20,
    backgroundColor: palette.surfaceStrong,
    padding: 16,
    borderRadius: 18,
    marginTop: 14,
  },
  error: { color: "#ff8066", textAlign: "center", marginTop: 10 },
  emptyState: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  brand: {
    color: palette.accent,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 42,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
  },
  emptyCopy: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 12,
  },
  retry: {
    alignSelf: "flex-start",
    backgroundColor: palette.accent,
    borderRadius: 14,
    paddingHorizontal: 20,
    height: 46,
    justifyContent: "center",
    marginTop: 24,
  },
  retryText: { color: palette.onAccent, fontWeight: "900" },
});
