import { View, type StyleProp, type ViewStyle } from "react-native";
import clsx from "clsx";

export function Skeleton({ className, style }: { className?: string; style?: StyleProp<ViewStyle> }) {
  return <View className={clsx("animate-pulse rounded-md bg-surface-raised", className)} style={style} />;
}
