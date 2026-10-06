// components/foryou/ForYouHeader.tsx
//
// Tab strip (For you / New / Trending / Collections) floating over the video,
// plus the search button. Collections adds an All/Drama/Story/Anime chip row.

import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search } from "lucide-react-native";
import { CATEGORIES, type Category } from "@/lib/categories";
import { FOR_YOU_TABS, type ForYouTab } from "@/lib/forYouTabs";
import { SegmentedControl } from "@/components/library/SegmentedControl";
import { Text } from "@/components/ui/Text";
import { useI18n } from "@/hooks/useI18n";
import { useTheme } from "@/hooks/useTheme";

export function ForYouHeader({
  tab,
  onTabChange,
  category,
  onCategoryChange,
  onSearch,
  onVideo = true,
}: {
  tab: ForYouTab;
  onTabChange: (tab: ForYouTab) => void;
  category: Category;
  onCategoryChange: (category: Category) => void;
  onSearch: () => void;
  // True while a video sits behind the header (white text on a dark scrim);
  // false for loading/empty states, which use the app theme instead.
  onVideo?: boolean;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const fg = onVideo ? "#fff" : colors.text;
  const fgDim = onVideo ? "rgba(255,255,255,0.6)" : colors.muted;
  const insets = useSafeAreaInsets();
  // Measured underline: measure the active tab's box instead of hard-coding
  // an offset, so it stays aligned if a label (or language) changes width.
  const layouts = useRef<Record<string, { x: number; w: number }>>({});
  const underlineX = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);

  function moveTo(key: string, animate: boolean) {
    const l = layouts.current[key];
    if (!l) return;
    const target = l.x + l.w / 2 - 14;
    if (!animate) underlineX.setValue(target);
    else Animated.timing(underlineX, { toValue: target, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    setReady(true);
  }

  useEffect(() => {
    moveTo(tab, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 30 }}>
      {onVideo ? (
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,0.7)", "rgba(0,0,0,0.3)", "rgba(0,0,0,0)"]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        />
      ) : null}
      <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 12 }} pointerEvents="box-none">
        <View className="flex-row items-center gap-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1" accessibilityRole="tablist">
            <View className="relative flex-row items-center gap-4 pb-2">
              {FOR_YOU_TABS.map(({ key, labelKey }) => (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === key }}
                  onPress={() => onTabChange(key)}
                  onLayout={(e) => {
                    layouts.current[key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
                    if (key === tab) moveTo(key, ready);
                  }}
                >
                  <Text
                    className="text-[15px] font-extrabold uppercase tracking-wide"
                    style={{ color: tab === key ? fg : fgDim }}
                  >
                    {t(labelKey)}
                  </Text>
                </Pressable>
              ))}
              {ready ? (
                <Animated.View
                  pointerEvents="none"
                  className="absolute bottom-0 h-[3px] w-7 rounded-full bg-pink"
                  style={{ left: 0, transform: [{ translateX: underlineX }] }}
                />
              ) : null}
            </View>
          </ScrollView>
          <Pressable onPress={onSearch} accessibilityLabel={t("common.search")} hitSlop={8} className="-mt-2 h-8 w-8 items-center justify-center">
            <Search size={19} color={fg} />
          </Pressable>
        </View>

        {tab === "collections" ? (
          <View className="mt-1">
            <SegmentedControl ariaLabel={t("foryou.collection")} tone={onVideo ? "overlay" : "themed"} options={CATEGORIES} value={category} onChange={onCategoryChange} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
