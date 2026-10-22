import { palette } from "./theme";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function TabScreen({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.brand}>● SidCraft</Text>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {children ?? <PreviewCard />}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PreviewCard({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>PRODUCT PREVIEW</Text>
      <Text style={styles.cardTitle}>
        This area is now part of the app navigation.
      </Text>
      <Text style={styles.cardBody}>
        {children ??
          "Its complete data and interaction slice will be connected next."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  page: { flexGrow: 1, padding: 22, paddingBottom: 44 },
  brand: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 50,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: "900",
  },
  title: {
    color: palette.text,
    fontSize: 42,
    lineHeight: 46,
    fontWeight: "900",
    marginTop: 10,
  },
  description: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
    marginBottom: 30,
  },
  card: {
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderSoft,
    borderRadius: 24,
    padding: 22,
  },
  cardLabel: {
    color: palette.accent,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: "900",
  },
  cardTitle: {
    color: palette.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    marginTop: 14,
  },
  cardBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
  },
});

export const tabStyles = styles;
