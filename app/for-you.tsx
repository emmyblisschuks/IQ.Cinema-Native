// app/for-you.tsx

import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ForYouFeed } from "@/components/foryou/ForYouFeed";

// Always dark, whatever the app theme — it's a video feed.
export default function ForYouPage() {
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <ForYouFeed />
    </View>
  );
}
