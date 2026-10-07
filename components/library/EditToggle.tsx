// components/library/EditToggle.tsx
import { Pressable, View } from "react-native";
import { SquarePen } from "lucide-react-native";
import clsx from "clsx";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/hooks/useI18n";

export function EditToggle({
  editing,
  disabled,
  onToggle,
}: {
  editing: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled && !editing}
      accessibilityLabel={editing ? t("downloads.doneEditing") : t("library.editList")}
      className={clsx(
        "h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-1",
        disabled && !editing && "opacity-30"
      )}
    >
      {editing ? (
        <Text className="px-2 text-[15px] font-semibold text-pink">{t("downloads.done")}</Text>
      ) : (
        <Icon as={SquarePen} size={24} strokeWidth={1.75} tone="text" />
      )}
    </Pressable>
  );
}
