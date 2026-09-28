import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, type ScrollViewProps } from "react-native";
import { useTheme } from "@/hooks/useTheme";

// The web version is a hand-rolled touch gesture over a document-level
// scroll. Native scroll views ship the real thing, so this is a ScrollView
// with a themed RefreshControl — same call shape (`onRefresh`, children).
export function PullToRefresh({
  onRefresh,
  children,
  ...scrollProps
}: {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
} & Omit<ScrollViewProps, "refreshControl" | "children">) {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.pink}
          colors={[colors.pink]}
          progressBackgroundColor={colors.surface}
        />
      }
      {...scrollProps}
    >
      {children}
    </ScrollView>
  );
}
