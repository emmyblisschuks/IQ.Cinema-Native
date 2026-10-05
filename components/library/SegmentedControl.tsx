import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import clsx from "clsx";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  tone = "themed",
}: {
  options: readonly { value: T; label: string; labelKey?: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  // "overlay": same control restyled for sitting on top of video (For You is
  // always dark, whatever the app theme).
  tone?: "themed" | "overlay";
}) {
  const { t } = useI18n();
  const overlay = tone === "overlay";
  const { isDark, colors } = useTheme();
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const thumbW = width > 0 ? (width - 8) / options.length : 0;

  useEffect(() => {
    Animated.timing(x, {
      toValue: index * thumbW,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, thumbW, x]);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={ariaLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className={clsx("relative h-11 flex-row rounded-lg p-1", overlay ? "" : "bg-surface-raised")}
      style={overlay ? { backgroundColor: "rgba(0,0,0,0.5)" } : undefined}
    >
      {/* Sliding thumb: one element that moves, instead of a color swap. */}
      {thumbW > 0 ? (
        <Animated.View
          pointerEvents="none"
          className="absolute rounded-md"
          style={{
            top: 4,
            bottom: 4,
            left: 4,
            width: thumbW,
            backgroundColor: overlay ? "rgba(255,255,255,0.22)" : isDark ? colors.border : colors.surface,
            transform: [{ translateX: x }],
            ...(isDark || overlay
              ? null
              : { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }),
          }}
        />
      ) : null}
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: option.value === value }}
          onPress={() => onChange(option.value)}
          className="flex-1 items-center justify-center"
        >
          <Text
            className={clsx(
              "text-[15px] font-semibold",
              overlay ? (option.value === value ? "text-white" : "text-white/60") : option.value === value ? "text-text" : "text-muted"
            )}
          >
            {option.labelKey ? t(option.labelKey) : option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
