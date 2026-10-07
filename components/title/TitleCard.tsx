import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Flame } from "lucide-react-native";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { Scrim } from "@/components/ui/Scrim";
import { formatCount } from "@/lib/format";
import { useI18n } from "@/hooks/useI18n";

export type TitleCardData = {
  id: string;
  slug: string;
  title: string;
  poster_url: string | null;
  total_unique_views: number;
  is_exclusive: boolean;
  genre_label?: string;
  // Tapping the card goes straight into episode 1's player, skipping the
  // synopsis/"Watch now" gate — falls back to the title page when a title
  // has no published episodes yet.
  first_episode_id?: string | null;
};

export function TitleCard({ title, size = "md" }: { title: TitleCardData; size?: "sm" | "md" }) {
  const { t } = useI18n();
  const router = useRouter();
  const width = size === "sm" ? 112 : 144; // w-28 / w-36
  const href = title.first_episode_id ? `/watch/${title.first_episode_id}` : `/title/${title.slug}`;

  return (
    <Pressable onPress={() => router.push(href as never)} className="shrink-0" style={{ width }}>
      {({ pressed }) => (
        <View>
          <View className="relative overflow-hidden rounded-md bg-surface-raised" style={{ aspectRatio: 9 / 16 }}>
            {title.poster_url ? (
              <Image
                source={{ uri: title.poster_url }}
                accessibilityLabel={title.title}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                }}
                contentFit="cover"
              />
            ) : (
              <View className="h-full items-center justify-center">
                <Text className="text-xs text-muted">{t("common.poster.none")}</Text>
              </View>
            )}

            {title.is_exclusive ? (
              <View className="absolute left-1.5 top-1.5 rounded-sm bg-crimson px-1.5 py-0.5">
                <Text className="text-[10px] font-semibold text-white">{t("title.exclusive")}</Text>
              </View>
            ) : null}

            <View className="absolute inset-x-0 bottom-0">
              <Scrim from={0.8} via={0.4} style={{ top: 0 }} />
              <View className="flex-row items-center gap-1 px-1.5 pb-1.5 pt-4">
                <Icon as={Flame} size={11} tone="pink" fillTone="pink" />
                <Text className="text-[11px] text-white/90">{formatCount(title.total_unique_views)}</Text>
              </View>
            </View>
          </View>

          <Text numberOfLines={2} className="mt-1.5 text-[13px] font-medium leading-tight text-text">
            {title.title}
          </Text>
          {title.genre_label ? <Text className="mt-0.5 text-[11px] text-muted">{title.genre_label}</Text> : null}
        </View>
      )}
    </Pressable>
  );
}
