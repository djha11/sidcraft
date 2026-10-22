import { palette } from "../src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api";
import { useAuth } from "../src/auth";

type UsernameState = "idle" | "checking" | "available" | "taken" | "invalid";
const validUsername = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])?$/;

export default function Register() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [developmentOtp, setDevelopmentOtp] = useState("");
  const [usernameState, setUsernameState] = useState<UsernameState>("idle");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const auth = useAuth();

  useEffect(() => {
    if (name.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(
      () =>
        void api
          .usernameAvailability({ displayName: name.trim() })
          .then((result) => {
            setSuggestions(result.suggestions);
            if (!username && result.suggestions[0])
              setUsername(result.suggestions[0]);
          })
          .catch(() => undefined),
      350,
    );
    return () => clearTimeout(timer);
  }, [name]);

  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (!clean) {
      setUsernameState("idle");
      return;
    }
    if (!validUsername.test(clean)) {
      setUsernameState("invalid");
      return;
    }
    setUsernameState("checking");
    const timer = setTimeout(
      () =>
        void api
          .usernameAvailability({
            username: clean,
            displayName: name.trim() || undefined,
          })
          .then((result) => {
            setUsernameState(result.available ? "available" : "taken");
            if (!result.available) setSuggestions(result.suggestions);
          })
          .catch(() => setUsernameState("idle")),
      450,
    );
    return () => clearTimeout(timer);
  }, [username]);

  async function submit() {
    if (usernameState !== "available") {
      setError("Choose an available username first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!otpSent) {
        const result = await api.requestEmailOtp(
          email.trim().toLowerCase(),
          "signup",
        );
        setOtpSent(true);
        setDevelopmentOtp(result.developmentOtp ?? "");
        return;
      }
      await auth.register(
        name,
        username.trim().toLowerCase(),
        email,
        password,
        otp,
      );
      router.replace("/(tabs)/pulse");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? friendlyError(caught.message)
          : "Could not create your account.",
      );
    } finally {
      setBusy(false);
    }
  }

  const status =
    usernameState === "available"
      ? {
          icon: "checkmark-circle" as const,
          color: palette.accent,
          text: "Username is available",
        }
      : usernameState === "taken"
        ? {
            icon: "close-circle" as const,
            color: "#ff6b7d",
            text: "That username is already taken",
          }
        : usernameState === "invalid"
          ? {
              icon: "alert-circle" as const,
              color: "#ffb84d",
              text: "Use 3–30 letters, numbers, dots, or underscores",
            }
          : null;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.page}
        >
          <View style={styles.glow} />
          <Pressable
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={styles.back}
          >
            <Ionicons name="arrow-back" size={22} color={palette.text} />
          </Pressable>
          <View style={styles.brandRow}>
            <View style={styles.brandDot} />
            <Text style={styles.brand}>SidCraft</Text>
          </View>
          <Text style={styles.eyebrow}>CREATE YOUR IDENTITY</Text>
          <Text style={styles.title}>Join what’s happening.</Text>
          <Text style={styles.sub}>
            Your username is how people find and mention you. Your votes always
            stay private.
          </Text>
          <View style={styles.formCard}>
            <Text style={styles.label}>Display name</Text>
            <Field icon="person-outline">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="What should we call you?"
                placeholderTextColor={palette.muted}
                style={styles.input}
              />
            </Field>
            <Text style={styles.label}>Username</Text>
            <View
              style={[
                styles.field,
                usernameState === "available" && styles.fieldAvailable,
                (usernameState === "taken" || usernameState === "invalid") &&
                  styles.fieldError,
              ]}
            >
              <Text style={styles.at}>@</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={(value) =>
                  setUsername(value.toLowerCase().replace(/\s/g, ""))
                }
                placeholder="your.username"
                placeholderTextColor={palette.muted}
                style={styles.input}
              />
              {usernameState === "checking" ? (
                <ActivityIndicator size="small" color={palette.accent} />
              ) : status ? (
                <Ionicons name={status.icon} size={20} color={status.color} />
              ) : null}
            </View>
            {status ? (
              <Text style={[styles.status, { color: status.color }]}>
                {status.text}
              </Text>
            ) : null}
            {suggestions.length ? (
              <View style={styles.suggestionBlock}>
                <Text style={styles.suggestionLabel}>Suggestions for you</Text>
                <View style={styles.chips}>
                  {suggestions.map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => setUsername(item)}
                      style={[
                        styles.chip,
                        username === item && styles.chipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          username === item && styles.chipTextSelected,
                        ]}
                      >
                        @{item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <Text style={styles.label}>Email</Text>
            <Field icon="mail-outline">
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={palette.muted}
                style={styles.input}
              />
            </Field>
            <Text style={styles.label}>Password</Text>
            <Field icon="lock-closed-outline">
              <TextInput
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="At least 10 characters"
                placeholderTextColor={palette.muted}
                style={styles.input}
              />
            </Field>
            {otpSent ? (
              <>
                <View style={styles.verifiedEmail}>
                  <Ionicons
                    name="mail-unread-outline"
                    size={19}
                    color={palette.accent}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.otpTitle}>
                      Enter the code we emailed you
                    </Text>
                    <Text style={styles.otpHint}>{email}</Text>
                  </View>
                </View>
                <TextInput
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={(value) => setOtp(value.replace(/\D/g, ""))}
                  placeholder="000000"
                  placeholderTextColor={palette.muted}
                  style={styles.otpInput}
                />
                {developmentOtp ? (
                  <Pressable
                    onPress={() => setOtp(developmentOtp)}
                    style={styles.devOtp}
                  >
                    <Text style={styles.devOtpText}>
                      Development preview: {developmentOtp} · tap to fill
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setOtpSent(false);
                    setOtp("");
                    setDevelopmentOtp("");
                  }}
                >
                  <Text style={styles.changeEmail}>
                    Change email or resend code
                  </Text>
                </Pressable>
              </>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              disabled={
                busy ||
                usernameState !== "available" ||
                (otpSent && otp.length !== 6)
              }
              onPress={submit}
              style={[
                styles.button,
                (busy ||
                  usernameState !== "available" ||
                  (otpSent && otp.length !== 6)) &&
                  styles.buttonDisabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={palette.onAccent} />
              ) : (
                <>
                  <Text style={styles.buttonText}>
                    {otpSent
                      ? "Verify & create account"
                      : "Email me a verification code"}
                  </Text>
                  <Ionicons
                    name={otpSent ? "checkmark" : "arrow-forward"}
                    size={20}
                    color={palette.onAccent}
                  />
                </>
              )}
            </Pressable>
          </View>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.foot}>
              Already have an account? <Text style={styles.link}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  icon,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Ionicons name={icon} size={19} color={palette.muted} />
      {children}
    </View>
  );
}
function friendlyError(value: string) {
  return value === "USERNAME_TAKEN"
    ? "That username was just taken. Please choose another."
    : value === "EMAIL_EXISTS"
      ? "An account already exists for this email."
      : value;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.surface },
  page: { flexGrow: 1, padding: 22, paddingBottom: 36 },
  glow: {
    position: "absolute",
    top: -110,
    right: -90,
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: "rgba(191,255,70,0.06)",
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.accent,
  },
  brand: { color: palette.text, fontSize: 21, fontWeight: "900" },
  eyebrow: {
    color: palette.accent,
    fontSize: 11,
    letterSpacing: 2.2,
    fontWeight: "900",
    marginTop: 28,
  },
  title: {
    color: palette.text,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "900",
    marginTop: 8,
  },
  sub: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 24,
  },
  formCard: {
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 26,
    padding: 18,
  },
  label: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
    marginTop: 13,
  },
  field: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: palette.surfaceStrong,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  fieldAvailable: {
    borderColor: "rgba(191,255,70,0.7)",
    backgroundColor: "rgba(191,255,70,0.045)",
  },
  fieldError: { borderColor: "rgba(255,107,125,0.65)" },
  input: { color: palette.text, flex: 1, fontSize: 15, paddingVertical: 14 },
  at: { color: palette.accent, fontWeight: "900", fontSize: 18 },
  status: { fontSize: 12, fontWeight: "700", marginTop: 7, marginLeft: 3 },
  suggestionBlock: { marginTop: 13 },
  suggestionLabel: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    borderWidth: 1,
    borderColor: palette.borderSoft,
    backgroundColor: palette.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  chipSelected: {
    borderColor: palette.accent,
    backgroundColor: "rgba(191,255,70,0.1)",
  },
  chipText: { color: palette.text, fontSize: 12, fontWeight: "700" },
  chipTextSelected: { color: palette.accent },
  error: { color: "#ff7b8c", fontSize: 13, marginTop: 12 },
  button: {
    height: 58,
    backgroundColor: palette.accent,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 20,
  },
  buttonDisabled: { opacity: 0.38 },
  buttonText: { color: palette.onAccent, fontWeight: "900", fontSize: 16 },
  foot: { color: palette.muted, textAlign: "center", marginTop: 24 },
  link: { color: palette.accent, fontWeight: "900" },
  verifiedEmail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 18,
    padding: 13,
    borderRadius: 15,
    backgroundColor: "rgba(191,255,70,0.06)",
    borderWidth: 1,
    borderColor: "rgba(191,255,70,0.22)",
  },
  otpTitle: { color: palette.text, fontWeight: "800", fontSize: 13 },
  otpHint: { color: palette.muted, fontSize: 11, marginTop: 3 },
  otpInput: {
    marginTop: 12,
    height: 62,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.accent,
    backgroundColor: palette.surfaceStrong,
    color: palette.text,
    fontSize: 27,
    letterSpacing: 12,
    textAlign: "center",
    fontWeight: "900",
  },
  devOtp: { alignItems: "center", paddingVertical: 9 },
  devOtpText: { color: palette.accent, fontSize: 11, fontWeight: "700" },
  changeEmail: {
    color: palette.muted,
    fontSize: 12,
    textAlign: "center",
    textDecorationLine: "underline",
    paddingVertical: 7,
  },
});
