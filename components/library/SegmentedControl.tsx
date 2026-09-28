import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import clsx from "clsx";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/hooks/useTheme";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
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
      className="relative h-11 flex-row rounded-lg bg-surface-raised p-1"
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
            backgroundColor: isDark ? colors.border : colors.surface,
            transform: [{ translateX: x }],
            ...(isDark
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
          <Text className={clsx("text-[15px] font-semibold", option.value === value ? "text-text" : "text-muted")}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
