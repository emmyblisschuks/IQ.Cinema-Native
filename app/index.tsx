// app/index.tsx  (Home)

import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { createClient } from "@/lib/supabase/client";
import { HomeHeader } from "@/components/home/HomeHeader";
import { CategoryTabs } from "@/components/home/CategoryTabs";
import { HeroBanner } from "@/components/home/HeroBanner";
import { PopularGrid } from "@/components/home/PopularGrid";
import { HomeRefresh } from "@/components/home/HomeRefresh";
import { HomeSkeleton } from "@/components/home/HomeSkeleton";
import { FadeIn } from "@/components/ui/FadeIn";
import { Text } from "@/components/ui/Text";
import { useI18n } from "@/hooks/useI18n";

const supabase = createClient();

// The web page is `revalidate = 60`; natively the same window decides when a
// screen that regains focus is stale enough to refetch.
const REVALIDATE_MS = 60_000;

type SearchParams = { tab?: string; genre?: string };

type HomeTitle = { id: string; slug: string; title: string; poster_url: string | null };
type FeaturedTitle = HomeTitle & { banner_url: string | null; total_unique_views: number; genre: string | null };
type ExclusiveTitle = HomeTitle & { banner_url: string | null };

type HomeData = {
  featured: FeaturedTitle | null;
  exclusive: ExclusiveTitle | null;
  gridTitles: HomeTitle[];
  genres: string[];
  heading: string;
  firstEpisodeByTitle: Map<string, string>;
};

async function getHomeData({ tab, genre }: SearchParams): Promise<HomeData> {
  const activeTab = tab ?? "popular";

  let gridQuery = supabase
    .from("titles")
    .select("id, slug, title, poster_url")
    .eq("status", "published")
    .limit(12);

  let heading = "Popular Choices";

  if (activeTab === "new") {
    gridQuery = gridQuery.order("published_at", { ascending: false });
    heading = "New Releases";
  } else if (activeTab === "ranking") {
    gridQuery = gridQuery.order("total_unique_views", { ascending: false });
    heading = "Top Ranking";
  } else if (activeTab === "genre" && genre) {
    gridQuery = gridQuery.eq("genre", genre).order("total_unique_views", { ascending: false });
    heading = `${genre} Picks`;
  } else {
    gridQuery = gridQuery.order("total_unique_views", { ascending: false });
  }

  // These three don't depend on each other, so run them concurrently.
  const [{ data: featured }, { data: gridTitles }, { data: usedGenreRows }] = await Promise.all([
    supabase
      .from("titles")
      .select("id, slug, title, poster_url, banner_url, total_unique_views, genre")
      .eq("status", "published")
      .order("total_unique_views", { ascending: false })
      .limit(1)
      .maybeSingle(),
    gridQuery,
    // Only genres that a creator has actually published a title under —
    // not the full catalog in the `genres` table.
    supabase.from("titles").select("genre").eq("status", "published").not("genre", "is", null),
  ]);

  const genres = Array.from(new Set((usedGenreRows ?? []).map((r: { genre: string }) => r.genre))).sort() as string[];

  // Depends on featured.id, so it has to follow.
  const { data: exclusive } = await supabase
    .from("titles")
    .select("id, slug, title, poster_url, banner_url")
    .eq("status", "published")
    .eq("is_exclusive", true)
    .neq("id", featured?.id ?? "")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Tapping a poster from Home goes straight into episode 1 — no summary
  // page in between — so every card needs its title's first published
  // episode. One query for every title on the page, reduced to the lowest
  // episode_number per title_id.
  const allTitleIds = Array.from(
    new Set(
      [featured?.id, exclusive?.id, ...(gridTitles ?? []).map((t: HomeTitle) => t.id)].filter(
        (id): id is string => !!id
      )
    )
  );
  const firstEpisodeByTitle = new Map<string, string>();
  if (allTitleIds.length) {
    const { data: firstEpisodes } = await supabase
      .from("episodes")
      .select("id, title_id, episode_number")
      .in("title_id", allTitleIds)
      .eq("status", "published")
      .order("episode_number", { ascending: true });
    for (const ep of firstEpisodes ?? []) {
      if (!firstEpisodeByTitle.has(ep.title_id)) firstEpisodeByTitle.set(ep.title_id, ep.id);
    }
  }

  return {
    featured: featured as FeaturedTitle | null,
    exclusive: exclusive as ExclusiveTitle | null,
    gridTitles: (gridTitles ?? []) as HomeTitle[],
    genres,
    heading,
    firstEpisodeByTitle,
  };
}

export default function HomePage() {
  const { t } = useI18n();
  const { tab, genre } = useLocalSearchParams<SearchParams>();
  const activeTab = tab ?? "popular";

  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const fetchedAt = useRef(0);

  const load = useCallback(async () => {
    const thisRequest = ++requestId.current;
    try {
      const next = await getHomeData({ tab, genre });
      if (thisRequest !== requestId.current) return;
      fetchedAt.current = Date.now();
      setData(next);
      setFailed(false);
    } catch {
      if (thisRequest === requestId.current) setFailed(true);
    }
  }, [tab, genre]);

  useEffect(() => {
    load();
  }, [load]);

  // Revalidate on return if the data is older than the web page's 60s window.
  useFocusEffect(
    useCallback(() => {
      if (fetchedAt.current && Date.now() - fetchedAt.current > REVALIDATE_MS) load();
    }, [load])
  );

  if (!data) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
        {failed ? (
          <View className="mt-16 px-6">
            <Text className="text-center text-sm text-muted">Couldn't load titles. Pull down to retry.</Text>
          </View>
        ) : (
          <HomeSkeleton />
        )}
      </SafeAreaView>
    );
  }

  const { featured, exclusive, gridTitles, genres, heading, firstEpisodeByTitle } = data;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <HomeRefresh onRefresh={load}>
        <FadeIn style={{ paddingBottom: 24 }}>
          <HomeHeader />

          <CategoryTabs activeTab={activeTab} activeGenre={genre} genres={genres} />

          {/* Keyed so switching tabs remounts just this part and replays the
              fade — the header/tab bar above stay put. */}
          <FadeIn key={`${activeTab}-${genre ?? ""}`}>
            <HeroBanner
              featured={
                featured
                  ? {
                      ...featured,
                      genre_label: featured.genre ?? null,
                      first_episode_id: firstEpisodeByTitle.get(featured.id) ?? null,
                    }
                  : null
              }
              exclusive={
                exclusive
                  ? { ...exclusive, first_episode_id: firstEpisodeByTitle.get(exclusive.id) ?? null }
                  : null
              }
            />

            <PopularGrid
              heading={heading}
              titles={gridTitles.map((t) => ({
                ...t,
                first_episode_id: firstEpisodeByTitle.get(t.id) ?? null,
              }))}
            />

            {!featured && !gridTitles.length && (
              <View className="mt-16 px-6">
                <Text className="font-display text-center text-lg text-text">{t("home.nothingPublished")}</Text>
                <Text className="mt-1.5 text-center text-sm text-muted">
                  {t("home.nothingPublishedBody")}
                </Text>
              </View>
            )}
          </FadeIn>
        </FadeIn>
      </HomeRefresh>
    </SafeAreaView>
  );
}
