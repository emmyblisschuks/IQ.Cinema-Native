import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Text } from "@/components/ui/Text";
import { Scrim } from "@/components/ui/Scrim";

type HeroTitle = {
  slug: string;
  title: string;
  poster_url: string | null;
  banner_url: string | null;
  genre_label?: string | null;
  // Tapping the poster goes straight into episode 1's player, skipping the
  // synopsis/"Watch now" gate — falls back to the title page for a title
  // with no published episodes yet (e.g. coming soon).
  first_episode_id?: string | null;
};

function heroHref(t: HeroTitle) {
  return t.first_episode_id ? `/watch/${t.first_episode_id}` : `/title/${t.slug}`;
}

export function HeroBanner({
  featured,
  exclusive,
}: {
  featured: HeroTitle | null;
  exclusive: HeroTitle | null;
}) {
  const router = useRouter();
  if (!featured) return null;

  const featuredImg = featured.banner_url ?? featured.poster_url;
  const exclusiveImg = exclusive ? exclusive.banner_url ?? exclusive.poster_url : null;

  return (
    <View className="mt-4 flex-row gap-2 px-4">
      <Pressable
        onPress={() => router.push(heroHref(featured) as never)}
        className="relative overflow-hidden rounded-lg bg-surface-raised"
        style={{ flex: 2, aspectRatio: 9 / 16 }}
      >
        {featuredImg ? (
          <Image
            source={{ uri: featuredImg }}
            accessibilityLabel={featured.title}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
            contentFit="cover"
          />
        ) : null}
        <Scrim from={0.85} via={0.05} />
        <View className="absolute inset-x-0 bottom-0 p-3">
          {featured.genre_label ? (
            <Text className="text-[11px] font-medium uppercase tracking-wide text-gold">
              {featured.genre_label}
            </Text>
          ) : null}
          <Text numberOfLines={1} className="text-[15px] font-semibold text-white">
            {featured.title}
          </Text>
        </View>
      </Pressable>

      {exclusive ? (
        <Pressable
          onPress={() => router.push(heroHref(exclusive) as never)}
          className="relative overflow-hidden rounded-lg bg-surface-raised"
          style={{ flex: 1, aspectRatio: 9 / 16 }}
        >
          {exclusiveImg ? (
            <Image
              source={{ uri: exclusiveImg }}
              accessibilityLabel={exclusive.title}
              style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
              contentFit="cover"
            />
          ) : null}
          <Scrim from={0.85} via={0.1} />
          <View className="absolute left-1.5 top-1.5 rounded-sm bg-pink px-1.5 py-0.5">
            <Text className="text-[9px] font-semibold text-white">Exclusive</Text>
          </View>
          <Text
            numberOfLines={2}
            className="absolute inset-x-0 bottom-0 p-2 text-[12px] font-medium leading-tight text-white"
          >
            {exclusive.title}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
