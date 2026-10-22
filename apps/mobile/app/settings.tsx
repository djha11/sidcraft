import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { api } from "../src/api";
import type { UserPreferences } from "@pulse/contracts";
import { preferencesStorage } from "../src/preferences-storage";
import { palette } from "../src/theme";

type PreferenceKey =
  | "privateAccount"
  | "activityStatus"
  | "allowStoryReplies"
  | "allowMessageRequests"
  | "allowTags"
  | "allowMentions"
  | "allowComments"
  | "allowSharing"
  | "limitInteractions"
  | "hideCounts"
  | "autoplayMedia"
  | "highQualityUploads"
  | "dataSaver"
  | "notifications"
  | "sounds"
  | "reduceMotion"
  | "largeText"
  | "saveOriginalMedia"
  | "evidenceFirst"
  | "anonymousReplies";

type Preferences = UserPreferences;

type Row = {
  id: string;
  label: string;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  preference?: PreferenceKey;
  value?: (settings: Preferences) => string;
  action?: "permissions" | "logout" | "addAccount" | "verification";
};

type Section = { title: string; rows: Row[] };

const STORAGE_KEY = "pulse.settings.v1";
const defaults: Preferences = {
  privateAccount: false,
  activityStatus: true,
  allowStoryReplies: true,
  allowMessageRequests: true,
  allowTags: true,
  allowMentions: true,
  allowComments: true,
  allowSharing: true,
  limitInteractions: false,
  hideCounts: false,
  autoplayMedia: true,
  highQualityUploads: true,
  dataSaver: false,
  notifications: true,
  sounds: true,
  reduceMotion: false,
  largeText: false,
  saveOriginalMedia: true,
  evidenceFirst: true,
  anonymousReplies: true,
  language: "English",
  sensitiveContent: "Standard",
  dailyLimit: "Off",
};

const sections: Section[] = [
  {
    title: "Your account",
    rows: [
      {
        id: "account",
        label: "Account center",
        hint: "Password, security and personal details",
        icon: "person-circle-outline",
      },
      {
        id: "status",
        label: "Account status",
        hint: "Review account and content standing",
        icon: "shield-checkmark-outline",
      },
      {
        id: "verification",
        label: "Get your account verified",
        hint: "Request a verified badge and track its review status",
        icon: "checkmark-circle-outline",
        action: "verification",
      },
    ],
  },
  {
    title: "How you use SidCraft",
    rows: [
      { id: "saved", label: "Saved", icon: "bookmark-outline" },
      { id: "archive", label: "Archive", icon: "archive-outline" },
      { id: "activity", label: "Your activity", icon: "pulse-outline" },
      {
        id: "notifications",
        label: "Notifications",
        icon: "notifications-outline",
        preference: "notifications",
      },
      {
        id: "time",
        label: "Time management",
        icon: "time-outline",
        value: (s) => s.dailyLimit,
      },
    ],
  },
  {
    title: "Who can see your content",
    rows: [
      {
        id: "privacy",
        label: "Account privacy",
        icon: "lock-closed-outline",
        preference: "privateAccount",
      },
      { id: "friends", label: "Close friends", icon: "star-outline" },
      { id: "blocked", label: "Blocked accounts", icon: "ban-outline" },
      {
        id: "story",
        label: "Story, live and location",
        icon: "eye-off-outline",
        preference: "activityStatus",
      },
    ],
  },
  {
    title: "How others can interact with you",
    rows: [
      {
        id: "messages",
        label: "Messages and story replies",
        icon: "chatbubble-ellipses-outline",
        preference: "allowMessageRequests",
      },
      {
        id: "tags",
        label: "Tags and mentions",
        icon: "at-outline",
        preference: "allowTags",
      },
      {
        id: "comments",
        label: "Comments",
        icon: "chatbubble-outline",
        preference: "allowComments",
      },
      {
        id: "sharing",
        label: "Sharing and reposts",
        icon: "repeat-outline",
        preference: "allowSharing",
      },
      {
        id: "restricted",
        label: "Restricted accounts",
        icon: "remove-circle-outline",
      },
      {
        id: "limits",
        label: "Limit interactions",
        icon: "alert-circle-outline",
        preference: "limitInteractions",
      },
      { id: "hidden", label: "Hidden words", icon: "text-outline" },
      {
        id: "invite",
        label: "Follow and invite friends",
        icon: "person-add-outline",
      },
    ],
  },
  {
    title: "What you see",
    rows: [
      { id: "favorites", label: "Favorites", icon: "star-outline" },
      { id: "muted", label: "Muted accounts", icon: "volume-mute-outline" },
      {
        id: "content",
        label: "Content preferences",
        icon: "options-outline",
        value: (s) => s.sensitiveContent,
      },
      {
        id: "counts",
        label: "Like and share counts",
        icon: "heart-dislike-outline",
        preference: "hideCounts",
      },
    ],
  },
  {
    title: "Your app and media",
    rows: [
      {
        id: "permissions",
        label: "Device permissions",
        icon: "phone-portrait-outline",
        action: "permissions",
      },
      {
        id: "downloads",
        label: "Archiving and downloading",
        icon: "download-outline",
        preference: "saveOriginalMedia",
      },
      {
        id: "accessibility",
        label: "Reduce motion",
        icon: "accessibility-outline",
        preference: "reduceMotion",
      },
      {
        id: "textSize",
        label: "Larger text",
        icon: "text-outline",
        preference: "largeText",
      },
      {
        id: "language",
        label: "Language and sound",
        icon: "language-outline",
        value: (s) => `${s.language} · ${s.sounds ? "Sound on" : "Sound off"}`,
      },
      {
        id: "quality",
        label: "High-quality uploads",
        icon: "sparkles-outline",
        preference: "highQualityUploads",
      },
      {
        id: "data",
        label: "Data saver",
        icon: "cellular-outline",
        preference: "dataSaver",
      },
      {
        id: "autoplay",
        label: "Autoplay media",
        icon: "play-circle-outline",
        preference: "autoplayMedia",
      },
    ],
  },
  {
    title: "SidCraft safety and news",
    rows: [
      {
        id: "evidence",
        label: "Prioritize source-backed news",
        icon: "newspaper-outline",
        preference: "evidenceFirst",
      },
      {
        id: "anonymous",
        label: "Anonymous post replies",
        icon: "shield-outline",
        preference: "anonymousReplies",
      },
      {
        id: "pollPrivacy",
        label: "Poll and vote privacy",
        hint: "Individual votes always stay private",
        icon: "stats-chart-outline",
      },
    ],
  },
  {
    title: "More info and support",
    rows: [
      { id: "help", label: "Help", icon: "help-circle-outline" },
      {
        id: "privacyCenter",
        label: "Privacy center",
        icon: "shield-half-outline",
      },
      {
        id: "about",
        label: "About SidCraft",
        icon: "information-circle-outline",
      },
    ],
  },
  {
    title: "Login",
    rows: [
      {
        id: "add",
        label: "Add account",
        icon: "person-add-outline",
        action: "addAccount",
      },
      {
        id: "logout",
        label: "Log out",
        icon: "log-out-outline",
        action: "logout",
      },
    ],
  },
];

export default function SettingsScreen() {
  const auth = useAuth();
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState<Preferences>(defaults);
  const [selected, setSelected] = useState<Row | null>(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let active = true;
    void preferencesStorage.get(STORAGE_KEY).then((stored) => {
      if (!stored) return;
      try {
        if (active)
          setSettings({
            ...defaults,
            ...(JSON.parse(stored) as Partial<Preferences>),
          });
      } catch {
        // Ignore invalid legacy preferences.
      }
    });
    if (auth.accessToken)
      void api
        .preferences(auth.accessToken)
        .then((remote) => {
          if (!active) return;
          setSettings(remote);
          void preferencesStorage.set(STORAGE_KEY, JSON.stringify(remote));
        })
        .catch(() =>
          setSaveError(
            "Using saved device settings while SidCraft reconnects.",
          ),
        );
    return () => {
      active = false;
    };
  }, [auth.accessToken]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sections;
    return sections
      .map((section) => ({
        ...section,
        rows: section.rows.filter((row) =>
          `${row.label} ${row.hint ?? ""}`.toLowerCase().includes(needle),
        ),
      }))
      .filter((section) => section.rows.length);
  }, [query]);

  function update(key: PreferenceKey, value: boolean) {
    persist({ ...settings, [key]: value });
  }

  function persist(next: Preferences) {
    const previous = settings;
    setSettings(next);
    setSaveError("");
    void preferencesStorage.set(STORAGE_KEY, JSON.stringify(next));
    if (!auth.accessToken) return;
    void api
      .updatePreferences(next, auth.accessToken)
      .then((saved) => {
        setSettings(saved);
        void preferencesStorage.set(STORAGE_KEY, JSON.stringify(saved));
      })
      .catch(() => {
        setSettings(previous);
        setSaveError("That change could not be saved. Please try again.");
      });
  }

  function open(row: Row) {
    if (row.action === "verification") {
      router.push("/verify-profile" as never);
      return;
    }
    if (row.preference) {
      update(row.preference, !settings[row.preference]);
      return;
    }
    if (row.action === "permissions") {
      if (Platform.OS === "web")
        Alert.alert(
          "Website permissions",
          "Use the lock icon beside the browser address to manage camera, microphone and notifications.",
        );
      else void Linking.openSettings();
      return;
    }
    if (row.action === "logout") {
      Alert.alert(
        "Log out of SidCraft?",
        "You can sign in again at any time.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Log out",
            style: "destructive",
            onPress: async () => {
              await auth.logout();
              router.replace("/login");
            },
          },
        ],
      );
      return;
    }
    if (row.action === "addAccount") {
      void auth.logout().finally(() => router.replace("/login"));
      return;
    }
    setSelected(row);
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={s.back}
        >
          <Ionicons name="arrow-back" size={25} color={palette.text} />
        </Pressable>
        <Text style={s.title}>Settings and activity</Text>
        <View style={s.back} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        {saveError ? (
          <Text
            accessibilityRole="alert"
            style={{
              color: palette.danger,
              paddingHorizontal: 18,
              paddingTop: 12,
            }}
          >
            {saveError}
          </Text>
        ) : null}
        <View style={s.search}>
          <Ionicons name="search" size={20} color={palette.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search settings"
            placeholderTextColor={palette.muted}
            style={s.searchInput}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={19} color={palette.muted} />
            </Pressable>
          ) : null}
        </View>
        {filtered.map((section) => (
          <View key={section.title} style={s.section}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            {section.rows.map((row) => {
              const isDanger = row.action === "logout";
              return (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  onPress={() => open(row)}
                  style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                >
                  <View style={[s.icon, isDanger && s.dangerIcon]}>
                    <Ionicons
                      name={row.icon}
                      size={23}
                      color={isDanger ? palette.danger : palette.text}
                    />
                  </View>
                  <View style={s.copy}>
                    <Text style={[s.label, isDanger && s.danger]}>
                      {row.label}
                    </Text>
                    {row.hint ? <Text style={s.hint}>{row.hint}</Text> : null}
                  </View>
                  {row.preference ? (
                    <Switch
                      value={settings[row.preference]}
                      onValueChange={(value) => update(row.preference!, value)}
                      trackColor={{
                        false: palette.borderSoft,
                        true: palette.accentSoft,
                      }}
                      thumbColor={
                        settings[row.preference]
                          ? palette.accent
                          : palette.muted
                      }
                    />
                  ) : (
                    <>
                      <Text numberOfLines={1} style={s.value}>
                        {row.value?.(settings)}
                      </Text>
                      {!isDanger ? (
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={palette.muted}
                        />
                      ) : null}
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
        {!filtered.length ? (
          <View style={s.empty}>
            <Ionicons name="search-outline" size={38} color={palette.muted} />
            <Text style={s.emptyTitle}>No setting found</Text>
            <Text style={s.hint}>Try another word or phrase.</Text>
          </View>
        ) : null}
      </ScrollView>
      <SettingsDetail
        row={selected}
        settings={settings}
        close={() => setSelected(null)}
        save={persist}
      />
    </SafeAreaView>
  );
}

function SettingsDetail({
  row,
  settings,
  close,
  save,
}: {
  row: Row | null;
  settings: Preferences;
  close(): void;
  save(value: Preferences): void;
}) {
  if (!row) return null;
  const option = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable onPress={onPress} style={s.option}>
      <Text style={s.optionText}>{label}</Text>
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={22}
        color={selected ? palette.accent : palette.muted}
      />
    </Pressable>
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.scrim} onPress={close} />
      <View style={s.sheet}>
        <View style={s.grabber} />
        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>{row.label}</Text>
          <Pressable onPress={close}>
            <Ionicons name="close" size={24} color={palette.text} />
          </Pressable>
        </View>
        {row.id === "time" ? (
          (["Off", "30 minutes", "1 hour", "2 hours"] as const).map((value) => (
            <View key={value}>
              {option(value, settings.dailyLimit === value, () =>
                save({ ...settings, dailyLimit: value }),
              )}
            </View>
          ))
        ) : row.id === "content" ? (
          (["Less", "Standard", "More"] as const).map((value) => (
            <View key={value}>
              {option(value, settings.sensitiveContent === value, () =>
                save({ ...settings, sensitiveContent: value }),
              )}
            </View>
          ))
        ) : row.id === "language" ? (
          <>
            {["English", "हिन्दी", "বাংলা", "தமிழ்"].map((value) => (
              <View key={value}>
                {option(value, settings.language === value, () =>
                  save({ ...settings, language: value }),
                )}
              </View>
            ))}
            <View style={s.option}>
              <Text style={s.optionText}>App sounds</Text>
              <Switch
                value={settings.sounds}
                onValueChange={(sounds) => save({ ...settings, sounds })}
              />
            </View>
          </>
        ) : (
          <View style={s.detailBody}>
            <View style={s.detailIcon}>
              <Ionicons name={row.icon} size={32} color={palette.accent} />
            </View>
            <Text style={s.detailTitle}>{row.label}</Text>
            <Text style={s.detailText}>{detailText(row.id)}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

function detailText(id: string) {
  const copy: Record<string, string> = {
    account:
      "Manage your profile details from Edit profile. Password recovery and session security are available from the sign-in screen.",
    status:
      "Your account is active. Content removed for safety or source-policy reasons will appear here.",
    saved:
      "Saved posts and reels will appear here when saved-item syncing is enabled for your account.",
    archive: "Archived stories and posts remain visible only to you.",
    activity:
      "Review the posts, reels, stories, comments and reactions created from your account.",
    friends:
      "Close friends lets you share selected stories with a smaller audience.",
    blocked:
      "Blocked accounts cannot find your profile, message you or interact with your content.",
    restricted:
      "Restricted people are not notified, and their new comments remain hidden until approved.",
    hidden:
      "Add words and phrases you do not want to see in comments or message requests.",
    invite:
      "Share your SidCraft profile through the device share sheet or invite contacts you trust.",
    favorites:
      "Posts from favorite accounts receive priority in your personalized feed.",
    muted: "Muted accounts are not notified. You can unmute them at any time.",
    pollPrivacy:
      "SidCraft never exposes individual votes or small demographic result slices. Only safe aggregate results are shown.",
    help: "For help, report the screen and action that caused the problem. Diagnostic details never include your password or individual votes.",
    privacyCenter:
      "Review how SidCraft protects identity, anonymous activity, messages, location and civic poll participation.",
    about:
      "SidCraft is a source-conscious social, news, reels and civic participation experience.",
  };
  return (
    copy[id] ??
    "This setting is connected to your SidCraft experience and can be changed at any time."
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  header: {
    height: 58,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
  },
  back: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    color: palette.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  content: { paddingBottom: 36 },
  search: {
    margin: 16,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  searchInput: { flex: 1, color: palette.text, fontSize: 15 },
  section: {
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 9,
    borderTopWidth: 7,
    borderTopColor: palette.surfaceStrong,
  },
  sectionTitle: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 7,
  },
  row: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
  },
  rowPressed: { backgroundColor: palette.accentFaint },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  dangerIcon: { backgroundColor: "#FFF0F0" },
  copy: { flex: 1 },
  label: { color: palette.text, fontSize: 15, fontWeight: "700" },
  hint: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  value: { color: palette.muted, fontSize: 12, maxWidth: 135 },
  danger: { color: palette.danger },
  empty: { alignItems: "center", paddingTop: 65, gap: 8 },
  emptyTitle: { color: palette.text, fontWeight: "900", fontSize: 18 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.overlay },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82%",
    minHeight: 300,
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
    backgroundColor: palette.background,
    paddingHorizontal: 18,
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: palette.borderSoft,
  },
  grabber: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.borderSoft,
    alignSelf: "center",
    marginTop: 10,
  },
  sheetHead: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
  },
  sheetTitle: { color: palette.text, fontSize: 19, fontWeight: "900" },
  option: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
  },
  optionText: { color: palette.text, fontSize: 15, fontWeight: "700" },
  detailBody: { alignItems: "center", paddingHorizontal: 20, paddingTop: 28 },
  detailIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 16,
  },
  detailText: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 9,
  },
});
