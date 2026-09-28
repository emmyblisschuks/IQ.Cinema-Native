// components/watch/EpisodeTray.tsx

import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Lock, Play, Check } from "lucide-react-native";
import clsx from "clsx";
import { BottomSheet, markSheetNavigating } from "@/components/shared/BottomSheet";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { BrandGradient } from "@/components/ui/BrandGradient";
import { useGridCell } from "@/lib/layout";

export type TrayEpisode = {
  id: string;
  episode_number: number;
  name: string | null;
  unlock_cost_coins: number | null;
};

export function EpisodeTray({
  open,
  onClose,
  episodes,
  currentEpisodeId,
  freeCount,
  unlockedIds,
  defaultCost,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  episodes: TrayEpisode[];
  // Absent when opened from the title page, where nothing is playing yet.
  currentEpisodeId?: string;
  freeCount: number;
  unlockedIds: Set<string>;
  defaultCost: number;
  // When the tray is opened over the player, picking an episode scrolls the
  // feed to it instead of navigating (no reload, history stays clean).
  onSelect?: (episodeId: string) => void;
}) {
  const router = useRouter();
  // 4 columns, 10px gutters, 16px of horizontal padding (px-3 + sheet px-1).
  const cell = useGridCell(4, 10, 16);

  return (
    <BottomSheet open={open} onClose={onClose} title={`Episodes · ${episodes.length}`}>
      <View className="flex-row flex-wrap gap-2.5 px-3 pb-3 pt-1">
        {episodes.map((ep) => {
          const isFree = ep.episode_number <= freeCount;
          const isPaidUnlocked = unlockedIds.has(ep.id);
          const isUnlocked = isFree || isPaidUnlocked;
          const isCurrent = ep.id === currentEpisodeId;
          const cost = ep.unlock_cost_coins ?? defaultCost;

          return (
            <Pressable
              key={ep.id}
              accessibilityState={{ selected: isCurrent }}
              onPress={() => {
                if (onSelect) {
                  onSelect(ep.id);
                } else {
                  markSheetNavigating();
                  onClose();
                  router.replace(`/watch/${ep.id}` as never);
                }
              }}
              className={clsx(
                "relative h-14 items-center justify-center gap-0.5 overflow-hidden rounded-md border",
                isCurrent ? "border-transparent" : "border-border bg-surface-raised active:bg-border/60"
              )}
              style={{ width: cell }}
            >
              {isCurrent ? <BrandGradient radius={10} /> : null}
              {isCurrent ? (
                <Icon as={Play} size={11} tone="white" fillTone="white" />
              ) : isUnlocked ? (
                isPaidUnlocked ? <Icon as={Check} size={11} tone="gold" /> : null
              ) : (
                <Icon as={Lock} size={11} tone="muted" />
              )}
              <Text
                className={clsx(
                  "text-[13px] font-semibold",
                  isCurrent ? "text-white" : isUnlocked ? "text-text" : "text-muted"
                )}
              >
                {ep.episode_number}
              </Text>
              {!isUnlocked && !isCurrent ? (
                <Text className="text-[9px] font-normal text-muted">{cost}c</Text>
              ) : null}
            </Pressable>
          );
        })}

        {!episodes.length && (
          <Text className="w-full py-6 text-center text-sm text-muted">No episodes published yet.</Text>
        )}
      </View>
    </BottomSheet>
  );
}
