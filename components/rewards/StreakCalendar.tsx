import { View } from "react-native";
import { Check, Zap } from "lucide-react-native";
import clsx from "clsx";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/hooks/useI18n";

export function StreakCalendar({ schedule, todayIndex, checkedInToday }: {
  schedule: { day_index: number; coins: number }[];
  todayIndex: number;
  checkedInToday: boolean;
}) {
  const { t } = useI18n();
  return (
    <View accessibilityRole="list" accessibilityLabel={t("rewards.streakA11y")} className="flex-row gap-1.5">
      {schedule.map((d) => {
        const isToday = d.day_index === todayIndex;
        const isPast = d.day_index < todayIndex || (isToday && checkedInToday);
        return (
          <View
            key={d.day_index}
            
            className={clsx(
              "flex-1 items-center gap-1 rounded-md px-1 py-2",
              isToday && !checkedInToday ? "bg-pink" : isPast ? "bg-crimson-soft" : "bg-surface-raised"
            )}
            style={isToday && !checkedInToday
              ? { shadowColor: "rgb(255,42,105)", shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }
              : null}
          >
            <Text className={clsx("text-[9px] font-medium", isToday && !checkedInToday ? "text-white/90" : isPast ? "text-crimson" : "text-muted")}>
              {t("rewards.dayN", { n: d.day_index })}
            </Text>
            <View className={clsx("h-5 w-5 items-center justify-center rounded-full",
              isPast ? "bg-crimson" : isToday && !checkedInToday ? "bg-white/25" : "bg-border")}>
              {isPast
                ? <Icon as={Check} size={11} tone="white" />
                : <Icon as={Zap} size={10} tone={isToday && !checkedInToday ? "white" : "gold"} fillTone={isToday && !checkedInToday ? "white" : "gold"} />}
            </View>
            <Text className={clsx("text-[9.5px] font-semibold", isToday && !checkedInToday ? "text-white" : isPast ? "text-crimson" : "text-muted")}>
              +{d.coins}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
