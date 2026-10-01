// components/library/EditToggle.tsx
import { Pressable, View } from "react-native";
import { SquarePen } from "lucide-react-native";
import clsx from "clsx";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";

export function EditToggle({
  editing,
  disabled,
  onToggle,
}: {
  editing: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled && !editing}
      accessibilityLabel={editing ? "Done editing" : "Edit list"}
      className={clsx(
        "h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-1",
        disabled && !editing && "opacity-30"
      )}
    >
      {editing ? (
        <Text className="px-2 text-[15px] font-semibold text-pink">Done</Text>
      ) : (
        <Icon as={SquarePen} size={24} strokeWidth={1.75} tone="text" />
      )}
    </Pressable>
  );
}
