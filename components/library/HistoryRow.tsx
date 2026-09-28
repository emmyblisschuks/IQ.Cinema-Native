import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Bookmark } from "lucide-react-native";
import { progressLabel, watchHref, type MyListItem } from "@/lib/myList";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { Pop } from "@/components/ui/Pop";
import { CornerBadge } from "./FlameBadge";
import { SelectDot } from "./SelectDot";

// Horizontal row for the History tab. The bookmark on the right follows or
// unfollows the title without leaving the list.
export function HistoryRow({
  item,
  editing,
  selected,
  onToggleSelect,
  onToggleFollow,
}: {
  item: MyListItem;
  editing: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleFollow: () => void;
}) {
  const router = useRouter();

  return (
    <View className="flex-row items-center gap-3">
      {editing ? <SelectDot selected={selected} variant="plain" /> : null}

      <Pressable
        onPress={() => (editing ? onToggleSelect() : router.push(watchHref(item) as never))}
        accessibilityState={editing ? { selected } : undefined}
        accessibilityLabel={editing ? `${selected ? "Deselect" : "Select"} ${item.title.trim()}` : undefined}
        className="min-w-0 flex-1 flex-row gap-3.5"
      >
        <View className="relative shrink-0 overflow-hidden rounded-lg bg-surface-raised" style={{ width: 88, aspectRatio: 3 / 4 }}>
          {item.poster_url ? (
            <Image
              source={{ uri: item.poster_url }}
              accessibilityLabel={item.title}
              style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
              contentFit="cover"
            />
          ) : (
            <View className="h-full items-center justify-center">
              <Text className="text-[10px] text-muted">No poster</Text>
            </View>
          )}
          {item.is_following ? (
            <CornerBadge style={{ left: 0, top: 0, borderBottomRightRadius: 16 }}>
              <Text className="px-2 py-1 text-[11px] font-bold leading-none text-white">Following</Text>
            </CornerBadge>
          ) : null}
        </View>

        <View className="min-w-0 flex-1 py-1">
          <Text numberOfLines={2} className="text-[17px] font-semibold leading-snug text-text">
            {item.title.trim()}
          </Text>
          <Text className="mt-1 text-[13.5px] text-muted">{progressLabel(item)}</Text>
          {item.tags.length > 0 ? (
            <View className="mt-2.5 flex-row flex-wrap gap-1.5">
              {item.tags.slice(0, 2).map((tag) => (
                <View key={tag} className="rounded-md bg-surface-raised px-2 py-1">
                  <Text className="text-[12px] font-medium text-muted">{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>

      {!editing ? (
        <Pressable
          onPress={onToggleFollow}
          accessibilityState={{ selected: item.is_following }}
          accessibilityLabel={item.is_following ? "Unfollow" : "Follow"}
          className="h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-surface-raised"
        >
          <Pop active trigger={item.is_following}>
            <Icon
              as={Bookmark}
              size={28}
              strokeWidth={1.75}
              tone={item.is_following ? "pink" : "muted"}
              fillTone={item.is_following ? "pink" : undefined}
            />
          </Pop>
        </Pressable>
      ) : null}
    </View>
  );
}
