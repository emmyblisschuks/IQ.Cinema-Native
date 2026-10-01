import { Pressable, View } from "react-native";
import { ArrowLeft, Gauge, MoreHorizontal } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/Text";

export function PlayerTopBar({
  episodeNumber,
  onBack,
  onOpenTitle,
  speed,
  onOpenSpeed,
  onOpenMore,
  visible = true,
}: {
  episodeNumber: number;
  onBack: () => void;
  // Tapping the EP badge doubles as the old "open details" affordance —
  // title/synopsis now live in the player's bottom overlay.
  onOpenTitle?: () => void;
  speed: number;
  onOpenSpeed: () => void;
  onOpenMore: () => void;
  visible?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents={visible ? "box-none" : "none"}
      className="absolute inset-x-0 top-0 z-20 flex-row items-center justify-between px-3"
      style={{ paddingTop: insets.top + 10, opacity: visible ? 1 : 0 }}
    >
      <View className="flex-row items-center gap-2">
        <Pressable onPress={onBack} accessibilityLabel="Back" className="h-9 w-9 items-center justify-center rounded-full bg-black/50">
          <ArrowLeft size={18} color="#fff" />
        </Pressable>
        <Pressable onPress={onOpenTitle} className="rounded-full bg-black/50 px-3 py-1.5">
          <Text className="text-[13px] font-bold tracking-wide text-white">EP.{episodeNumber}</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center gap-2">
        <Pressable onPress={onOpenSpeed} className="flex-row items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5">
          <Gauge size={15} color="#fff" />
          <Text className="text-[13px] font-semibold text-white">{speed === 1 ? "Speed" : `${speed}x`}</Text>
        </Pressable>
        <Pressable onPress={onOpenMore} accessibilityLabel="More options" className="h-9 w-9 items-center justify-center rounded-full bg-black/50">
          <MoreHorizontal size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}
