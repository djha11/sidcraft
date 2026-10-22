import { palette } from "../src/theme";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/auth";
export default function Index() {
  const { accessToken, loading } = useAuth();
  if (loading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  return <Redirect href={accessToken ? "/(tabs)/pulse" : "/login"} />;
}
