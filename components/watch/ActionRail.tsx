import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Bookmark, MessageCircle, Layers } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ShareIcon } from "@/components/watch/ShareIcon";
import { Text } from "@/components/ui/Text";
import { formatCount } from "@/lib/format";

const iconShadow = {
  shadowColor: "#000",
  shadowOpacity: 0.6,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
} as const;

function RailButton({
  icon,
  count,
  label,
  showLabel,
  active,
  onPress,
}: {
  icon: ReactNode;
  count?: number;
  label: string;
  // Save/Comments show a running count under the icon; Share/Episodes show
  // the action name instead.
  showLabel?: boolean;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="items-center gap-0.5"
      style={({ pressed }) => (pressed ? { transform: [{ scale: 0.9 }] } : null)}
    >
      <View className="h-9 w-9 items-center justify-center" style={[iconShadow, active ? { transform: [{ scale: 1.05 }] } : null]}>
        {icon}
      </View>
      <Text
        className="text-[12px] font-semibold leading-none text-white"
        style={{ textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}
      >
        {showLabel ? label : formatCount(count ?? 0)}
      </Text>
    </Pressable>
  );
}

// Compact stack in the lower third of the screen, right side.
// Order: Save, Comments, Share, Episodes (Episodes always last / lowest).
export function ActionRail({
  saved,
  saveCount,
  onToggleSave,
  commentCount,
  onOpenComments,
  shareCount,
  onShare,
  onOpenEpisodes,
  bottom,
}: {
  saved: boolean;
  saveCount: number;
  onToggleSave: () => void;
  commentCount: number;
  onOpenComments: () => void;
  shareCount: number;
  onShare: () => void;
  onOpenEpisodes: () => void;
  // Distance from the bottom edge; the feed raises it while the seek bar is up.
  bottom?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      className="absolute right-3 z-20 items-center gap-1"
      style={{ bottom: bottom ?? insets.bottom + 96 }}
    >
      <RailButton
        icon={<Bookmark size={32} color={saved ? "rgb(196,146,74)" : "#fff"} fill={saved ? "rgb(196,146,74)" : "none"} />}
        count={saveCount}
        active={saved}
        label={saved ? "Remove from My List" : "Save to My List"}
        onPress={onToggleSave}
      />
      <RailButton icon={<MessageCircle size={31} color="#fff" />} count={commentCount} label="View comments" onPress={onOpenComments} />
      <RailButton icon={<ShareIcon size={30} />} count={shareCount} label="Share" showLabel onPress={onShare} />
      <RailButton icon={<Layers size={30} color="#fff" />} label="Episodes" showLabel onPress={onOpenEpisodes} />
    </View>
  );
}
