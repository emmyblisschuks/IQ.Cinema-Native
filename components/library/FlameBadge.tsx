import { View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";

// The orange → pink corner tab used for "Following" / "New EP"
// (`bg-gradient-to-r from-orange-500 to-pink` on web).
export function CornerBadge({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ position: "absolute", overflow: "hidden" }, style]}>
      <LinearGradient
        colors={["rgb(249,115,22)", "rgb(255,42,105)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      {children}
    </View>
  );
}
