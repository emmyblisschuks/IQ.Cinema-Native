import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import { progressLabel, watchHref, type MyListItem } from "@/lib/myList";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { CornerBadge } from "./FlameBadge";
import { SelectDot } from "./SelectDot";
import { useI18n } from "@/hooks/useI18n";

// Grid card for the Following and Reminder tabs.
export function PosterCard({
  item,
  editing,
  selected,
  onToggleSelect,
  upcoming = false,
  width,
}: {
  item: MyListItem;
  editing: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  // Coming-soon titles have nothing to resume: link to the title page and
  // show a status line instead of episode progress.
  upcoming?: boolean;
  width: number;
}) {
  const { t, genre } = useI18n();
  const router = useRouter();
  const label = item.tags[0];

  function onPress() {
    if (editing) onToggleSelect();
    else router.push((upcoming ? `/title/${item.slug}` : watchHref(item)) as never);
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityState={editing ? { selected } : undefined}
      accessibilityLabel={editing ? `${selected ? t("common.deselect") : t("common.select")} ${item.title.trim()}` : undefined}
      style={{ width }}
    >
      {({ pressed }) => (
        <View>
          <View className="relative overflow-hidden rounded-lg bg-surface-raised" style={{ aspectRatio: 3 / 4 }}>
            {item.poster_url ? (
              <Image
                source={{ uri: item.poster_url }}
                accessibilityLabel={item.title}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  transform: [{ scale: pressed && !editing ? 0.95 : 1 }],
                }}
                contentFit="cover"
              />
            ) : (
              <View className="h-full items-center justify-center">
                <Text className="text-xs text-muted">{t("common.poster.none")}</Text>
              </View>
            )}

            {item.is_exclusive ? (
              <View className="absolute left-1.5 top-1.5 rounded-sm bg-crimson px-1.5 py-0.5">
                <Text className="text-[10px] font-semibold text-white">{t("home.exclusive")}</Text>
              </View>
            ) : null}

            {item.has_new_episode ? (
              <CornerBadge style={{ right: 0, top: 0, borderBottomLeftRadius: 16 }}>
                <View className="flex-row items-center gap-1 px-2 py-1">
                  <Icon as={Sparkles} size={12} tone="white" fillTone="white" />
                  <Text className="text-[12px] font-bold leading-none text-white">{t("library.newEp")}</Text>
                </View>
              </CornerBadge>
            ) : null}

            {label ? (
              <View className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5" style={{ maxWidth: "78%" }}>
                <Text numberOfLines={1} className="text-[11px] font-medium text-white">
                  {genre(label)}
                </Text>
              </View>
            ) : null}

            {editing ? <SelectDot selected={selected} className="absolute bottom-1.5 right-1.5" /> : null}

            {/* ring-2 ring-pink */}
            {selected ? (
              <View
                pointerEvents="none"
                className="absolute rounded-lg border-2 border-pink"
                style={{ left: 0, right: 0, top: 0, bottom: 0 }}
              />
            ) : null}
          </View>

          <Text numberOfLines={1} className="mt-2 text-[14px] font-semibold text-text">
            {item.title.trim()}
          </Text>
          <Text className="mt-0.5 text-[12.5px] text-muted">{upcoming ? t("title.comingSoon") : progressLabel(item)}</Text>
        </View>
      )}
    </Pressable>
  );
}
