import { palette } from "../src/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
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

export default function ForgotPassword() {
  const [step, setStep] = useState<"email" | "reset" | "done">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [developmentOtp, setDevelopmentOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const result = await api.requestEmailOtp(
        email.trim().toLowerCase(),
        "password_reset",
      );
      setDevelopmentOtp(result.developmentOtp ?? "");
      setStep("reset");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.resetPassword({
        email: email.trim().toLowerCase(),
        otp,
        password,
        confirmPassword,
      });
      setStep("done");
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.glow} />
          <Pressable
            accessibilityLabel="Back"
            onPress={() =>
              step === "email" ? router.back() : setStep("email")
            }
            style={styles.back}
          >
            <Ionicons name="arrow-back" size={22} color={palette.text} />
          </Pressable>
          <View style={styles.iconWrap}>
            <Ionicons
              name={step === "done" ? "checkmark" : "key-outline"}
              size={32}
              color={palette.onAccent}
            />
          </View>
          {step === "done" ? (
            <>
              <Text style={styles.title}>Password updated.</Text>
              <Text style={styles.sub}>
                Your account is secure and all previous sessions have been
                signed out.
              </Text>
              <Pressable
                onPress={() => router.replace("/login")}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Return to sign in</Text>
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={palette.onAccent}
                />
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
              <Text style={styles.title}>
                {step === "email"
                  ? "Find your account."
                  : "Create a new password."}
              </Text>
              <Text style={styles.sub}>
                {step === "email"
                  ? "Enter your registered email. We’ll send a secure six-digit code if an account exists."
                  : `Enter the code sent to ${email}. It expires in 10 minutes.`}
              </Text>
              <View style={styles.card}>
                <Text style={styles.label}>Email address</Text>
                <View style={styles.field}>
                  <Ionicons
                    name="mail-outline"
                    size={19}
                    color={palette.muted}
                  />
                  <TextInput
                    editable={step === "email"}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={palette.muted}
                    style={styles.input}
                  />
                </View>
                {step === "reset" ? (
                  <>
                    <Text style={styles.label}>Verification code</Text>
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
                        <Text style={styles.devText}>
                          Development preview: {developmentOtp} · tap to fill
                        </Text>
                      </Pressable>
                    ) : null}
                    <Text style={styles.label}>New password</Text>
                    <View style={styles.field}>
                      <Ionicons
                        name="lock-closed-outline"
                        size={19}
                        color={palette.muted}
                      />
                      <TextInput
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                        placeholder="At least 10 characters"
                        placeholderTextColor={palette.muted}
                        style={styles.input}
                      />
                    </View>
                    <Text style={styles.label}>Confirm password</Text>
                    <View style={styles.field}>
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={19}
                        color={palette.muted}
                      />
                      <TextInput
                        secureTextEntry
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="Type it again"
                        placeholderTextColor={palette.muted}
                        style={styles.input}
                      />
                    </View>
                  </>
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable
                  disabled={
                    busy ||
                    !email.trim() ||
                    (step === "reset" &&
                      (otp.length !== 6 ||
                        password.length < 10 ||
                        !confirmPassword))
                  }
                  onPress={step === "email" ? sendCode : reset}
                  style={[
                    styles.button,
                    (busy ||
                      !email.trim() ||
                      (step === "reset" &&
                        (otp.length !== 6 ||
                          password.length < 10 ||
                          !confirmPassword))) &&
                      styles.disabled,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color={palette.onAccent} />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>
                        {step === "email"
                          ? "Send recovery code"
                          : "Reset password"}
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={20}
                        color={palette.onAccent}
                      />
                    </>
                  )}
                </Pressable>
              </View>
              {step === "reset" ? (
                <Pressable onPress={() => setStep("email")}>
                  <Text style={styles.secondary}>
                    Use a different email or resend
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function message(caught: unknown) {
  const value = caught instanceof Error ? caught.message : "REQUEST_FAILED";
  return value === "INVALID_OTP"
    ? "That code is incorrect."
    : value === "OTP_EXPIRED"
      ? "That code expired. Request a new one."
      : value === "OTP_LOCKED"
        ? "Too many attempts. Request a new code."
        : value === "OTP_RESEND_TOO_SOON"
          ? "Please wait one minute before requesting another code."
          : value;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.surface },
  page: { flexGrow: 1, padding: 24, justifyContent: "center" },
  glow: {
    position: "absolute",
    top: -100,
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(191,255,70,0.055)",
  },
  back: {
    position: "absolute",
    top: 20,
    left: 22,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceStrong,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "900",
  },
  title: {
    color: palette.text,
    fontSize: 38,
    lineHeight: 43,
    fontWeight: "900",
    marginTop: 8,
  },
  sub: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 25,
  },
  card: {
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 25,
    padding: 18,
  },
  label: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
    marginTop: 12,
  },
  field: {
    height: 56,
    borderRadius: 16,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  input: { color: palette.text, flex: 1, fontSize: 15 },
  otpInput: {
    height: 62,
    borderRadius: 16,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.accent,
    color: palette.text,
    textAlign: "center",
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 12,
  },
  devOtp: { alignItems: "center", paddingVertical: 9 },
  devText: { color: palette.accent, fontSize: 11, fontWeight: "700" },
  button: {
    height: 58,
    borderRadius: 18,
    backgroundColor: palette.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
  },
  buttonText: { color: palette.onAccent, fontWeight: "900", fontSize: 16 },
  disabled: { opacity: 0.38 },
  error: { color: "#ff7b8c", fontSize: 13, marginTop: 12 },
  secondary: {
    color: palette.muted,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    padding: 18,
  },
});
