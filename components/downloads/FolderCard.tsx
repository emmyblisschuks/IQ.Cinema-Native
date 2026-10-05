import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Download, Folder } from "lucide-react-native";
import clsx from "clsx";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { SelectDot } from "@/components/library/SelectDot";
import { formatEpisodeCount } from "@/lib/format";
import { useI18n } from "@/hooks/useI18n";
import type { DownloadFolder } from "@/hooks/useDownloads";

// One movie folder on the Downloads screen. Same 3:4 poster card as My List.
export function FolderCard({
  folder,
  editing,
  selected,
  onPress,
}: {
  folder: DownloadFolder;
  editing: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const name = folder.title.trim();
  const count = folder.rows.length;

  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected }}
      accessibilityLabel={editing ? t(selected ? "downloads.deselectItem" : "downloads.selectItem", { name }) : name}
      className="min-w-0"
    >
      <View
        className={clsx("relative overflow-hidden rounded-lg bg-surface-raised", selected && "border-2 border-pink")}
        style={{ aspectRatio: 3 / 4 }}
      >
        {folder.poster ? (
          <Image source={{ uri: folder.poster }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-xs text-muted">{t("common.poster.none")}</Text>
          </View>
        )}

        {folder.activeCount > 0 ? (
          <View className="absolute right-0 top-0 flex-row items-center gap-1 rounded-bl-lg bg-pink px-2 py-1">
            <Icon as={Download} size={12} tone="white" />
            <Text className="text-[12px] font-bold leading-none text-white">{folder.activeCount}</Text>
          </View>
        ) : null}

        <View className="absolute bottom-1.5 left-1.5 flex-row items-center gap-1 rounded-md px-1.5 py-0.5" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <Folder size={11} color="rgba(255,255,255,0.9)" fill="rgba(255,255,255,0.9)" />
          <Text className="text-[11px] font-medium text-white">{t("common.epCount", { n: count })}</Text>
        </View>

        {editing ? <SelectDot selected={selected} className="absolute bottom-1.5 right-1.5" /> : null}
      </View>

      <Text numberOfLines={1} className="mt-2 text-[14px] font-semibold text-text">{name}</Text>
      <Text numberOfLines={1} className="mt-0.5 text-[12.5px] text-muted">{formatEpisodeCount(count, t)}</Text>
    </Pressable>
  );
}
