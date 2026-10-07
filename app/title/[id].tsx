// app/title/[id].tsx

import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { TitleActions } from "@/components/title/TitleActions";
import { FadeIn } from "@/components/ui/FadeIn";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";
import { formatEpisodeCount } from "@/lib/format";
import { kindOf } from "@/lib/contentTypes";
import { UUID_RE, stripLegacySlugSuffix, titlePath } from "@/lib/links";
import { rgba } from "@/lib/theme";
import type { TrayEpisode } from "@/components/watch/EpisodeTray";

const supabase = createClient();

const TITLE_COLS =
  "id, slug, title, synopsis, poster_url, banner_url, content_type, content_rating, status, credit_name, total_unique_views, free_episode_count";

type TitleRow = {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  poster_url: string | null;
  banner_url: string | null;
  content_type: string;
  content_rating: string;
  status: string;
  credit_name: string | null;
  total_unique_views: number;
  free_episode_count: number | null;
};

// The route segment is the title's slug (derived from the unique movie
// title). A raw id or an old suffixed slug (still-standing-b34779) still
// resolves, and the screen swaps itself to the clean /title/<slug>.
async function findTitle(param: string): Promise<TitleRow | null> {
  const bySlug = await supabase.from("titles").select(TITLE_COLS).eq("slug", param).maybeSingle();
  if (bySlug.data) return bySlug.data as TitleRow;
  if (UUID_RE.test(param)) {
    const byId = await supabase.from("titles").select(TITLE_COLS).eq("id", param).maybeSingle();
    if (byId.data) return byId.data as TitleRow;
  }
  const stripped = stripLegacySlugSuffix(param);
  if (stripped) {
    const legacy = await supabase.from("titles").select(TITLE_COLS).eq("slug", stripped).maybeSingle();
    if (legacy.data) return legacy.data as TitleRow;
  }
  return null;
}

type Loaded = {
  title: TitleRow;
  episodes: TrayEpisode[];
  settings: { default_free_episodes: number; default_episode_unlock_coins: number } | null;
};

async function getTitle(param: string): Promise<Loaded | null> {
  const title = await findTitle(param);
  if (!title) return null;

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, episode_number, name, unlock_cost_coins")
    .eq("title_id", title.id)
    .eq("status", "published")
    .order("episode_number", { ascending: true });

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("default_free_episodes, default_episode_unlock_coins")
    .single();

  return { title, episodes: (episodes ?? []) as TrayEpisode[], settings };
}

export default function TitlePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { colors, tokens } = useTheme();
  const [data, setData] = useState<Loaded | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "ready">("loading");

  useEffect(() => {
    let ignore = false;
    setState("loading");
    getTitle(id).then((res) => {
      if (ignore) return;
      if (!res) {
        setState("missing");
        return;
      }
      // Canonicalize: an id / legacy slug swaps itself for /title/<slug>.
      if (res.title.slug !== id) {
        router.replace(titlePath(res.title.slug) as never);
        return;
      }
      setData(res);
      setState("ready");
    });
    return () => {
      ignore = true;
    };
  }, [id, router]);

  if (state === "missing") {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-6">
        <Text className="font-display text-lg text-text">{t("title.notFound")}</Text>
        <Text className="mt-1.5 text-center text-sm text-muted">{t("common.notFoundHint")}</Text>
      </View>
    );
  }

  if (state !== "ready" || !data) {
    return (
      <View className="flex-1 bg-bg">
        <Skeleton className="w-full rounded-none" style={{ aspectRatio: 9 / 16 }} />
      </View>
    );
  }

  const { title, episodes, settings } = data;
  const freeCount = title.free_episode_count ?? settings?.default_free_episodes ?? 4;
  const defaultCost = settings?.default_episode_unlock_coins ?? 30;
  const cover = title.banner_url ?? title.poster_url;

  return (
    <ScrollView className="flex-1 bg-bg" showsVerticalScrollIndicator={false}>
      <FadeIn>
        <View className="relative w-full" style={{ aspectRatio: 9 / 16 }}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              accessibilityLabel={title.title}
              style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
              contentFit="cover"
              priority="high"
            />
          ) : null}
          {/* from-bg via-transparent to-black/30 (bottom → top) */}
          <LinearGradient
            pointerEvents="none"
            colors={[colors.bg, rgba(tokens["--bg"], 0), "rgba(0,0,0,0.3)"]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          />
        </View>

        {/* Sits below the poster, not over it — the poster's own gradient
            already fades into the page. */}
        <View className="px-4 pb-8 pt-6">
          <Text className="font-display text-[22px] font-semibold leading-tight text-text">{title.title}</Text>
          {title.credit_name ? <Text className="mt-1 text-[14px] font-medium text-pink">{title.credit_name}</Text> : null}
          <Text className="mt-1 text-[13px] text-muted">
            {title.content_rating} ·{" "}
            {title.status === "coming_soon"
              ? t("title.comingSoon")
              : kindOf(title.content_type).multi
                ? formatEpisodeCount(episodes.length, t)
                : t(kindOf(title.content_type).nameKey)}
          </Text>

          {title.synopsis ? (
            <Text className="mt-3 text-[14px] leading-relaxed text-text/85">{title.synopsis}</Text>
          ) : null}

          <TitleActions
            titleId={title.id}
            slug={title.slug}
            status={title.status}
            episodes={episodes}
            freeCount={freeCount}
            defaultCost={defaultCost}
          />
        </View>
      </FadeIn>
    </ScrollView>
  );
}
