import { View } from "react-native";
import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <View className={clsx("animate-pulse rounded-md bg-surface-raised", className)} />;
}
