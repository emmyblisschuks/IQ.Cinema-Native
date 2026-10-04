// app/watch/[...params].tsx
//
// Accepted routes:
//   /watch/still-standing/ep-2   readable link (what Share produces)
//   /watch/still-standing        title slug alone -> episode 1
//   /watch/<episode-uuid>        older links and in-app links
//
// Resolves the segments to an episode, then EpisodeFeed owns navigation
// between episodes. (Server-side link previews / redirects from the web app
// have no native equivalent: the OS opens the app via deep link instead.)

import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { EpisodeFeed } from "@/components/watch/EpisodeFeed";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { UUID_RE, stripLegacySlugSuffix } from "@/lib/links";

const supabase = createClient();

type TitleRow = { id: string; slug: string; title: string; synopsis: string | null; poster_url: string | null };

const TITLE_COLS = "id, slug, title, synopsis, poster_url";

async function resolve(segments: string[]): Promise<{ episodeId: string; episodeNumber: number } | null> {
  // /watch/<uuid>
  if (segments.length === 1 && UUID_RE.test(segments[0])) {
    const { data: ep, error } = await supabase
      .from("episodes")
      .select("id, episode_number, title_id")
      .eq("id", segments[0])
      .maybeSingle();
    if (error) throw error;
    if (!ep) return null;
    return { episodeId: ep.id as string, episodeNumber: ep.episode_number as number };
  }

  if (segments.length > 2) return null;
  const [slugParam, epParam] = segments;

  let episodeNumber = 1;
  if (epParam !== undefined) {
    const m = epParam.match(/^(?:ep-?)?(\d+)$/i);
    if (!m) return null;
    episodeNumber = Number(m[1]);
  }

  const first = await supabase.from("titles").select(TITLE_COLS).eq("slug", slugParam).maybeSingle();
  if (first.error) throw first.error;
  let title = first.data;
  if (!title) {
    // Slugs made before titles were unique ended in a random 6-char suffix.
    const stripped = stripLegacySlugSuffix(slugParam);
    if (stripped) {
      ({ data: title } = await supabase.from("titles").select(TITLE_COLS).eq("slug", stripped).maybeSingle());
    }
  }
  if (!title) return null;

  const { data: ep, error: epError } = await supabase
    .from("episodes")
    .select("id, episode_number")
    .eq("title_id", (title as TitleRow).id)
    .eq("episode_number", episodeNumber)
    .eq("status", "published")
    .maybeSingle();
  if (epError) throw epError;
  if (!ep) return null;

  return { episodeId: ep.id as string, episodeNumber };
}

export default function WatchPage() {
  const { params } = useLocalSearchParams<{ params: string | string[] }>();
  const segments = Array.isArray(params) ? params : params ? [params] : [];
  const key = segments.join("/");

  const [state, setState] = useState<{ status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ready"; episodeId: string }>({
    status: "loading",
  });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState({ status: "loading" });
    resolve(segments)
      .then((r) => {
        if (ignore) return;
        setState(r ? { status: "ready", episodeId: r.episodeId } : { status: "missing" });
      })
      .catch((e) => {
        console.warn("watch resolve failed", e?.message ?? e);
        if (!ignore) setState({ status: "error" });
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  if (state.status === "missing") {
    return (
      <View className="flex-1 items-center justify-center bg-black px-6">
        <Text className="font-display text-lg text-white">Episode not found</Text>
        <Text className="mt-1.5 text-center text-sm text-white/60">It may have been removed or unpublished.</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-black px-6">
        <Text className="font-display text-lg text-white">Couldn't load this episode</Text>
        <Text className="text-center text-sm text-white/60">Check your connection and try again.</Text>
        <Button variant="gold" onPress={() => setAttempt((n) => n + 1)}>Try again</Button>
      </View>
    );
  }

  if (state.status === "loading") return <View className="flex-1 bg-black" />;

  return <EpisodeFeed key={state.episodeId} initialEpisodeId={state.episodeId} />;
}
