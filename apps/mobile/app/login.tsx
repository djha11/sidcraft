import { palette } from "../src/theme";
import { Link, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const auth = useAuth();
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await auth.login(email, password);
      router.replace("/(tabs)/pulse");
    } catch (e) {
      setError(e instanceof Error ? e.message : "LOGIN_FAILED");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={s.safe}>
      <View pointerEvents="none" style={s.glowTop} />
      <View pointerEvents="none" style={s.glowBottom} />
      <View style={s.wrap}>
        <View style={s.brandRow}>
          <View style={s.brandMark} />
          <Text style={s.logo}>SidCraft</Text>
        </View>
        <Text style={s.title}>Welcome back.</Text>
        <Text style={s.sub}>Sign in to see your personalized SidCraft.</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={palette.muted}
          value={email}
          onChangeText={setEmail}
          style={s.input}
        />
        <TextInput
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={palette.muted}
          value={password}
          onChangeText={setPassword}
          style={s.input}
        />
        <Pressable
          onPress={() => router.push("/forgot-password")}
          style={s.forgotButton}
        >
          <Text style={s.forgot}>Forgot password?</Text>
        </Pressable>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable
          disabled={busy}
          onPress={submit}
          style={({ pressed }) => [s.button, pressed && s.buttonPressed]}
        >
          {busy ? (
            <ActivityIndicator color={palette.onAccent} />
          ) : (
            <Text style={s.buttonText}>Sign in</Text>
          )}
        </Pressable>
        <Text style={s.foot}>
          New here?{" "}
          <Link href="/register" style={s.link}>
            Create an account
          </Link>
        </Text>
      </View>
    </SafeAreaView>
  );
}
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background, overflow: "hidden" },
  wrap: { flex: 1, justifyContent: "center", padding: 24 },
  glowTop: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: palette.accentSoft,
    opacity: 0.72,
    top: -125,
    right: -105,
  },
  glowBottom: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: palette.accentFaint,
    bottom: -115,
    left: -95,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
  },
  brandMark: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: palette.accent,
    marginRight: 8,
    shadowColor: palette.accent,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  logo: {
    color: palette.accent,
    fontWeight: "900",
    fontSize: 21,
    letterSpacing: -0.5,
  },
  title: {
    color: palette.text,
    fontWeight: "900",
    fontSize: 36,
    letterSpacing: -1.1,
  },
  sub: { color: palette.muted, fontSize: 15, marginTop: 8, marginBottom: 30 },
  input: {
    height: 58,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 16,
    color: palette.text,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 1,
  },
  button: {
    height: 56,
    borderRadius: 16,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 5,
  },
  buttonPressed: {
    backgroundColor: palette.accentPressed,
    transform: [{ scale: 0.99 }],
  },
  buttonText: { color: palette.onAccent, fontWeight: "800", fontSize: 16 },
  error: { color: "#ff8066", marginVertical: 6 },
  foot: { color: palette.muted, textAlign: "center", marginTop: 24 },
  link: { color: palette.accent, fontWeight: "700" },
  forgotButton: {
    alignSelf: "flex-end",
    marginTop: -2,
    marginBottom: 8,
    paddingVertical: 6,
  },
  forgot: { color: palette.accent, fontSize: 13, fontWeight: "800" },
});
