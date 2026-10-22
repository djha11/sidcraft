import { palette } from "../../src/theme";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  pulse: "pulse-outline",
  feed: "home-outline",
  news: "play-circle-outline",
  chat: "chatbubble-ellipses-outline",
  search: "search-outline",
  profile: "person-outline",
};

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === "web" && width >= 900;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarPosition: desktop ? "left" : "bottom",
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: [styles.bar, desktop && styles.desktopBar],
        tabBarItemStyle: desktop ? styles.desktopItem : undefined,
        tabBarLabelStyle: [styles.label, desktop && styles.desktopLabel],
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
            <Ionicons
              accessibilityElementsHidden
              name={icons[route.name] ?? "ellipse-outline"}
              size={21}
              color={focused ? palette.onAccent : color}
            />
          </View>
        ),
      })}
    >
      <Tabs.Screen name="pulse" options={{ href: null }} />
      <Tabs.Screen name="feed" options={{ title: "Home" }} />
      <Tabs.Screen name="news" options={{ title: "Reels" }} />
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="search" options={{ title: "Search" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scene: { backgroundColor: palette.background },
  bar: {
    height: 76,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: palette.background,
    borderTopColor: palette.borderSoft,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  label: { fontSize: 10, fontWeight: "800", marginTop: 2, letterSpacing: 0.1 },
  iconWrap: {
    width: 36,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: palette.accent,
    transform: [{ translateY: -1 }],
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.24,
    shadowRadius: 7,
    elevation: 4,
  },
  desktopBar: {
    width: 224,
    height: "100%",
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 14,
    borderTopWidth: 0,
    borderRightWidth: 1,
    borderRightColor: palette.borderSoft,
    elevation: 0,
    shadowOpacity: 0,
  },
  desktopItem: {
    minHeight: 56,
    borderRadius: 14,
    marginVertical: 3,
  },
  desktopLabel: { fontSize: 13, marginTop: 0 },
});
