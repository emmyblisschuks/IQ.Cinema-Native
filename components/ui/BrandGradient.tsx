import { LinearGradient } from "expo-linear-gradient";
import type { StyleProp, ViewStyle } from "react-native";

// The pink → crimson brand fill (`bg-gradient-to-r from-pink to-crimson`),
// absolutely positioned to sit behind a control's content.
export function BrandGradient({ radius = 10, style }: { radius?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={["rgb(255,42,105)", "rgb(150,45,40)"]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: radius }, style]}
    />
  );
}
