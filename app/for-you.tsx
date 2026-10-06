// app/for-you.tsx

import { View } from "react-native";
import { ForYouFeed } from "@/components/foryou/ForYouFeed";
import { useTheme } from "@/hooks/useTheme";

// The video itself is always dark; everything around it (loading, empty and
// error states, search) follows the app theme.
export default function ForYouPage() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ForYouFeed />
    </View>
  );
}
