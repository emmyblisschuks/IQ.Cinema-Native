// components/library/LibraryTabs.tsx
// Same style as Home's CategoryTabs — uppercase extrabold with a sliding pink
// indicator. The edit button moved to EditToggle beside the filter row.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import clsx from "clsx";
import { Text } from "@/components/ui/Text";
import { useI18n } from "@/hooks/useI18n";

export type TopTab = "following" | "history" | "reminders";

const TABS: { value: TopTab; labelKey: string }[] = [
  { value: "following", labelKey: "library.following" },
  { value: "history", labelKey: "library.history" },
  { value: "reminders", labelKey: "library.reminders" },
];

export function LibraryTabs({
  value,
  onChange,
}: {
  value: TopTab;
  onChange: (tab: TopTab) => void;
}) {
  const { t } = useI18n();
  const [boxes, setBoxes] = useState<Partial<Record<TopTab, { x: number; w: number }>>>({});
  const center = boxes[value] ? boxes[value]!.x + boxes[value]!.w / 2 : null;
  const left = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (center === null) return;
    const target = center - 14;
    if (!placed.current) { placed.current = true; left.setValue(target); return; }
    Animated.timing(left, {
      toValue: target, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [center, left]);

  return (
    <View accessibilityRole="tablist" accessibilityLabel={t("library.myList")} className="relative flex-row gap-4 pb-3 pt-1">
      {TABS.map(({ value: tab, labelKey }) => (
        <Pressable
          key={tab}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === tab }}
          onPress={() => onChange(tab)}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            setBoxes((prev) =>
              prev[tab]?.x === x && prev[tab]?.w === width ? prev : { ...prev, [tab]: { x, w: width } }
            );
          }}
        >
          <Text
            numberOfLines={1}
            className={clsx(
              "shrink-0 text-[16px] font-extrabold uppercase tracking-wide",
              value === tab ? "text-text" : "text-muted"
            )}
          >
            {t(labelKey)}
          </Text>
        </Pressable>
      ))}
      {center !== null ? (
        <Animated.View
          pointerEvents="none"
          className="absolute bottom-0 h-[3px] w-7 rounded-full bg-pink"
          style={{ left: 0, transform: [{ translateX: left }] }}
        />
      ) : null}
    </View>
  );
}
