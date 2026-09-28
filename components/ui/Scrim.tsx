import { LinearGradient } from "expo-linear-gradient";
import type { StyleProp, ViewStyle } from "react-native";

// Bottom-up dark gradient used over posters (`bg-gradient-to-t from-black/85
// via-black/5 to-transparent` on web).
export function Scrim({
  from = 0.85,
  via = 0.05,
  style,
}: {
  from?: number;
  via?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[`rgba(0,0,0,${from})`, `rgba(0,0,0,${via})`, "rgba(0,0,0,0)"]}
      locations={[0, 0.5, 1]}
      start={{ x: 0, y: 1 }}
      end={{ x: 0, y: 0 }}
      style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }, style]}
    />
  );
}
