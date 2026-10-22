import { useLocalSearchParams } from "expo-router";
import { ProfileScreen } from "./(tabs)/profile";

export default function UserProfile() {
  const params = useLocalSearchParams<{ userId?: string }>();
  const viewedUserId =
    typeof params.userId === "string" ? params.userId : undefined;
  return <ProfileScreen viewedUserId={viewedUserId} />;
}
