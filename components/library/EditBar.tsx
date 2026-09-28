import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { SelectDot } from "./SelectDot";

// Replaces the bottom nav while editing (the library screen hides the nav),
// the same way most mobile list-editing UIs swap the tab bar for an action bar.
export function EditBar({
  selectedCount,
  total,
  actionLabel,
  onToggleAll,
  onAction,
}: {
  selectedCount: number;
  total: number;
  actionLabel: string;
  onToggleAll: () => void;
  onAction: () => void;
}) {
  const insets = useSafeAreaInsets();
  const allSelected = total > 0 && selectedCount === total;

  return (
    <View className="w-full border-t border-border bg-surface" style={{ paddingBottom: insets.bottom }}>
      <View className="h-16 w-full max-w-md flex-row items-center justify-between gap-3 self-center px-4">
        <Pressable onPress={onToggleAll} className="flex-row items-center gap-2.5">
          <SelectDot selected={allSelected} variant="plain" />
          <Text className="text-[15px] font-medium text-text">{allSelected ? "Deselect all" : "Select all"}</Text>
        </Pressable>
        <Button variant="danger" size="md" disabled={selectedCount === 0} onPress={onAction}>
          {`${actionLabel}${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
        </Button>
      </View>
    </View>
  );
}
