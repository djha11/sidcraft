import { palette } from "../src/theme";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, View } from "react-native";
import { AuthProvider } from "../src/auth";
import { registerGlobals } from "../src/livekit";
registerGlobals();
export default function RootLayout() {
  return (
    <AuthProvider>
      <View style={styles.viewport}>
        <View style={styles.appShell}>
          <StatusBar style="dark" backgroundColor={palette.background} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.background },
            }}
          />
        </View>
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    backgroundColor:
      Platform.OS === "web" ? palette.surfaceStrong : palette.background,
    alignItems: "center",
  },
  appShell: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 1440 : undefined,
    backgroundColor: palette.background,
    ...Platform.select({
      web: {
        shadowColor: palette.shadow,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 28,
      },
      default: {},
    }),
  },
});
