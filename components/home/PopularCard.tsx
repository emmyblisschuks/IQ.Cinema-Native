import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Text } from "@/components/ui/Text";
import { useI18n } from "@/hooks/useI18n";

export type PopularCardData = {
  id: string;
  slug: string;
  title: string;
  poster_url: string | null;
  // Tapping the card goes straight into episode 1's player, skipping the
  // synopsis/"Watch now" gate — falls back to the title page when a title
  // has no published episodes yet.
  first_episode_id?: string | null;
};

export function PopularCard({ title, rank, width }: { title: PopularCardData; rank: number; width: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const href = title.first_episode_id ? `/watch/${title.first_episode_id}` : `/title/${title.slug}`;
  return (
    <Pressable onPress={() => router.push(href as never)} style={{ width }}>
      {({ pressed }) => (
        <View>
          <View className="relative overflow-hidden rounded-lg bg-surface-raised" style={{ aspectRatio: 9 / 16 }}>
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
            <View className="absolute right-1.5 top-1.5 rounded-sm bg-crimson px-1.5 py-0.5">
              <Text className="text-[10px] font-semibold text-white">{t("home.hot")}</Text>
            </View>
          </View>

          <Text numberOfLines={2} className="mt-1.5 text-[13px] font-medium leading-tight text-text">
            {title.title}
          </Text>
          <Text className="mt-0.5 text-[11px] font-medium text-pink">Daily list No. {rank}</Text>
        </View>
      )}
    </Pressable>
  );
}
