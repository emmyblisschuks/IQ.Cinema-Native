import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import clsx from "clsx";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/hooks/useI18n";

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function SpeedSheet({
  open,
  onClose,
  speed,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  speed: number;
  onSelect: (speed: number) => void;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet open={open} onClose={onClose} title={t("player.speedTitle")}>
      <View className="pb-1">
        {PLAYBACK_SPEEDS.map((s) => {
          const active = s === speed;
          return (
            <Pressable
              key={s}
              onPress={() => {
                onSelect(s);
                onClose();
              }}
              className="mx-2 flex-row items-center justify-between rounded-md px-3.5 py-3 active:bg-surface-raised"
            >
              <Text className={clsx("text-[15px]", active ? "font-semibold text-pink" : "text-text")}>
                {s === 1 ? t("player.speedNormal") : `${s}x`}
              </Text>
              {active ? <Icon as={Check} size={17} tone="pink" /> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}
