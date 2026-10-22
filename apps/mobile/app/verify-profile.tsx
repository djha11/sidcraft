import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { palette } from "../src/theme";
type Kind = "general" | "grey" | "government" | "media" | "business";
const kinds: Array<{ id: Kind; label: string; color: string; hint: string }> = [
  {
    id: "general",
    label: "Notable profile",
    color: "#1689f8",
    hint: "Public figures, creators and notable people",
  },
  {
    id: "grey",
    label: "Authentic profile",
    color: "#7b8798",
    hint: "Identity-confirmed accounts without a public-interest category",
  },
  {
    id: "government",
    label: "Government official",
    color: "#e89a18",
    hint: "Elected representatives and public offices",
  },
  {
    id: "media",
    label: "News and media",
    color: "#8b5cf6",
    hint: "Newsrooms and journalists",
  },
  {
    id: "business",
    label: "Business or advertiser",
    color: "#0aa79b",
    hint: "Registered organizations and advertisers",
  },
];
export default function VerifyProfile() {
  const auth = useAuth();
  const [kind, setKind] = useState<Kind>("general");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!auth.accessToken) return;
      let active = true;
      const refresh = () =>
        void api
          .verificationStatus(auth.accessToken!)
          .then((v) => {
            if (active) setStatus(v?.status ?? null);
          })
          .catch(() => {});
      refresh();
      const timer = setInterval(refresh, 10_000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [auth.accessToken]),
  );
  async function submit() {
    if (!auth.accessToken) return;
    setBusy(true);
    try {
      await api.requestVerification(
        {
          requestedType: kind,
          evidenceUrl: url.trim() || null,
          note: note.trim() || null,
        },
        auth.accessToken,
      );
      setStatus("pending");
      Alert.alert(
        "Request submitted",
        "SidCraft trust & safety will review your profile and evidence.",
      );
    } catch (e) {
      Alert.alert(
        "Could not submit",
        e instanceof Error ? e.message : "Please try again",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.head}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={25} color={palette.text} />
        </Pressable>
        <Text style={s.title}>Profile verification</Text>
        <View style={{ width: 25 }} />
      </View>
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.hero}>
          <Ionicons name="shield-checkmark" size={34} color={palette.accent} />
          <Text style={s.heroTitle}>Build trust with the right badge</Text>
          <Text style={s.hint}>
            Badges are assigned only after review. They can be changed or
            removed by trust & safety.
          </Text>
        </View>
        {status ? (
          <View style={s.status}>
            <Ionicons
              name={status === "approved" ? "checkmark-circle" : "time-outline"}
              size={20}
              color={palette.accent}
            />
            <Text style={s.statusText}>
              {status === "approved"
                ? "Profile verified — badge is active"
                : `Current request: ${status}`}
            </Text>
          </View>
        ) : null}
        <Text style={s.label}>Verification category</Text>
        {kinds.map((k) => (
          <Pressable
            key={k.id}
            onPress={() => setKind(k.id)}
            style={[s.option, kind === k.id && s.selected]}
          >
            <Ionicons name="checkmark-circle" size={26} color={k.color} />
            <View style={{ flex: 1 }}>
              <Text style={s.optionTitle}>{k.label}</Text>
              <Text style={s.hint}>{k.hint}</Text>
            </View>
            {kind === k.id ? (
              <Ionicons
                name="radio-button-on"
                size={20}
                color={palette.accent}
              />
            ) : null}
          </Pressable>
        ))}
        <Text style={s.label}>Evidence link</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="Official website or supporting source"
          placeholderTextColor={palette.muted}
          style={s.input}
        />
        <Text style={s.label}>Tell us why this profile should be verified</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={600}
          placeholder="Add useful review context"
          placeholderTextColor={palette.muted}
          style={[s.input, s.area]}
        />
        <Pressable
          disabled={busy || status === "pending" || status === "approved"}
          onPress={submit}
          style={[
            s.button,
            (busy || status === "pending" || status === "approved") &&
              s.disabled,
          ]}
        >
          <Text style={s.buttonText}>
            {status === "approved"
              ? "Verification active"
              : status === "pending"
                ? "Review in progress"
                : busy
                  ? "Submitting…"
                  : "Submit for review"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  head: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderColor: palette.borderSoft,
  },
  title: { fontSize: 18, fontWeight: "800", color: palette.text },
  body: { padding: 20, paddingBottom: 50 },
  hero: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    gap: 8,
  },
  heroTitle: { fontSize: 24, fontWeight: "900", color: palette.text },
  hint: { color: palette.muted, lineHeight: 19 },
  status: {
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    backgroundColor: palette.accentSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    color: palette.accent,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  label: {
    marginTop: 22,
    marginBottom: 9,
    color: palette.text,
    fontWeight: "800",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 16,
    backgroundColor: palette.surface,
  },
  selected: { borderColor: palette.accent },
  optionTitle: { fontWeight: "800", color: palette.text, fontSize: 15 },
  input: {
    padding: 15,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 15,
    color: palette.text,
    backgroundColor: palette.surface,
  },
  area: { minHeight: 110, textAlignVertical: "top" },
  button: {
    marginTop: 24,
    padding: 16,
    borderRadius: 15,
    alignItems: "center",
    backgroundColor: palette.accent,
  },
  disabled: { opacity: 0.55 },
  buttonText: { color: palette.onAccent, fontWeight: "900", fontSize: 16 },
});
