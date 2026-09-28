import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { SquarePen } from "lucide-react-native";
import clsx from "clsx";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";

export type TopTab = "following" | "history" | "reminders";

const TABS: { value: TopTab; label: string }[] = [
  { value: "following", label: "Following" },
  { value: "history", label: "History" },
  { value: "reminders", label: "Reminder Set" },
];

export function LibraryTabs({
  value,
  onChange,
  editing,
  editDisabled,
  onToggleEdit,
}: {
  value: TopTab;
  onChange: (tab: TopTab) => void;
  editing: boolean;
  editDisabled: boolean;
  onToggleEdit: () => void;
}) {
  // Each tab reports its own laid-out box so the indicator survives font
  // loading and copy changes.
  const [boxes, setBoxes] = useState<Partial<Record<TopTab, { x: number; w: number }>>>({});
  const center = boxes[value] ? boxes[value]!.x + boxes[value]!.w / 2 : null;
  const left = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (center === null) return;
    const target = center - 14; // half of the 28px (w-7) indicator
    if (!placed.current) {
      placed.current = true;
      left.setValue(target);
      return;
    }
    Animated.timing(left, {
      toValue: target,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [center, left]);

  return (
    <View className="flex-row items-start justify-between gap-3">
      <View accessibilityRole="tablist" accessibilityLabel="My List" className="relative flex-row gap-6 pb-3">
        {TABS.map(({ value: tab, label }) => (
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
              className={clsx("text-[21px] leading-tight", value === tab ? "font-semibold text-text" : "font-medium text-muted")}
            >
              {label}
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

      <Pressable
        onPress={onToggleEdit}
        disabled={editDisabled && !editing}
        accessibilityLabel={editing ? "Done editing" : "Edit list"}
        className={clsx("-mt-0.5 h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-1", editDisabled && !editing && "opacity-30")}
      >
        {editing ? (
          <Text className="px-2 text-[15px] font-semibold text-pink">Done</Text>
        ) : (
          <Icon as={SquarePen} size={24} strokeWidth={1.75} tone="text" />
        )}
      </Pressable>
    </View>
  );
}
