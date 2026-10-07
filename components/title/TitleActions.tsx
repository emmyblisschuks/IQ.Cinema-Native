// components/title/TitleActions.tsx

import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, BellRing, Bookmark, ChevronRight, ListVideo, Play } from "lucide-react-native";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { Pop } from "@/components/ui/Pop";
import { EpisodeTray, type TrayEpisode } from "@/components/watch/EpisodeTray";
import { useUnlockedEpisodeIds } from "@/hooks/useUnlockedEpisodes";
import { useI18n } from "@/hooks/useI18n";

const supabase = createClient();

// Follow (published titles) or Remind me (coming-soon titles). State lives in
// the same tables the My List tabs read, so a tap here shows up there.
export function TitleActions({
  titleId,
  slug,
  status,
  episodes,
  freeCount,
  defaultCost,
}: {
  titleId: string;
  slug: string;
  status: string;
  // Published episodes, in order. Feeds both "Watch now" (the first one) and
  // the shared episode tray, so there is a single source for both.
  episodes: TrayEpisode[];
  freeCount: number;
  defaultCost: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [reminded, setReminded] = useState(false);
  // A ref, not state: two taps in the same frame both see the old state value
  // and would both get past a state-based guard.
  const busyRef = useRef(false);
  // The viewer's tap is newer than the initial state lookup, so a slow lookup
  // answering afterwards must not undo it.
  const touched = useRef({ following: false, reminded: false });
  const [error, setError] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [trayLoaded, setTrayLoaded] = useState(false);
  // Which episodes this viewer has paid to unlock — only looked up once the
  // tray has actually been opened, so it costs nothing on load.
  const unlockedIds = useUnlockedEpisodeIds(
    episodes.map((e) => e.id),
    trayLoaded
  );
  const firstEpisodeId = episodes[0]?.id ?? null;
  const upcoming = status === "coming_soon";

  useEffect(() => {
    touched.current = { following: false, reminded: false };
    if (!user) {
      setFollowing(false);
      setReminded(false);
      return;
    }
    let ignore = false;
    supabase.rpc("get_title_user_state", { p_title_id: titleId }).then(({ data }) => {
      if (ignore) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (!touched.current.following) setFollowing(!!row?.is_following);
      if (!touched.current.reminded) setReminded(!!row?.has_reminder);
    });
    return () => {
      ignore = true;
    };
  }, [user, titleId]);

  function requireAuth() {
    router.push(`/auth/login?next=${encodeURIComponent(`/title/${slug}`)}`);
  }

  async function toggleFollow() {
    if (!user) return requireAuth();
    if (busyRef.current) return;
    busyRef.current = true;
    touched.current.following = true;
    const next = !following;
    setError(null);
    setFollowing(next);
    try {
      const { error: rpcError } = await supabase.rpc("set_titles_follow", {
        p_title_ids: [titleId],
        p_follow: next,
      });
      if (rpcError) throw rpcError;
    } catch {
      setFollowing(!next);
      setError(t("title.listError"));
    } finally {
      busyRef.current = false; // never leave the button locked
    }
  }

  async function toggleReminder() {
    if (!user) return requireAuth();
    if (busyRef.current) return;
    busyRef.current = true;
    touched.current.reminded = true;
    const next = !reminded;
    setError(null);
    setReminded(next);
    try {
      const { error: rpcError } = await supabase.rpc("set_title_reminders", {
        p_title_ids: [titleId],
        p_on: next,
      });
      if (rpcError) throw rpcError;
    } catch {
      setReminded(!next);
      setError(t("title.reminderError"));
    } finally {
      busyRef.current = false;
    }
  }

  if (upcoming) {
    return (
      <View className="mt-4">
        <Button
          variant={reminded ? "secondary" : "primary"}
          size="md"
          className="w-full"
          onPress={toggleReminder}
          accessibilityState={{ selected: reminded }}
        >
          {reminded ? <Icon as={BellRing} size={17} tone="pink" fillTone="pink" /> : <Icon as={Bell} size={17} />}
          {reminded ? t("title.reminderSet") : t("title.remindMe")}
        </Button>
        {error ? <Text className="mt-2 text-[12px] text-crimson">{error}</Text> : null}
      </View>
    );
  }

  return (
    <View className="mt-4">
      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          onPress={() => {
            if (firstEpisodeId) router.push(`/watch/${firstEpisodeId}` as never);
          }}
        >
          <Icon as={Play} size={16} tone="white" fillTone="white" />
          {t("title.watchNow")}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          accessibilityLabel={following ? t("title.unfollow") : t("title.follow")}
          accessibilityState={{ selected: following }}
          onPress={toggleFollow}
        >
          <Pop active trigger={following}>
            <Icon as={Bookmark} size={17} tone={following ? "pink" : "text"} fillTone={following ? "pink" : undefined} />
          </Pop>
        </Button>
      </View>

      {/* Episodes live in the same tray the player uses — one list, one place. */}
      {episodes.length > 0 ? (
        <Pressable
          onPress={() => {
            setTrayLoaded(true);
            setTrayOpen(true);
          }}
          className="mt-3 flex-row items-center justify-between rounded-md border border-border bg-surface px-4 py-3 active:bg-surface-raised"
        >
          <View className="flex-row items-center gap-2.5">
            <Icon as={ListVideo} size={18} tone="muted" />
            <Text className="text-[14px] font-medium text-text">{t("title.episodes")}</Text>
          </View>
          <Icon as={ChevronRight} size={18} tone="muted" />
        </Pressable>
      ) : (
        <Text className="mt-3 text-sm text-muted">{t("title.noEpisodes")}</Text>
      )}

      {error ? <Text className="mt-2 text-[12px] text-crimson">{error}</Text> : null}

      <EpisodeTray
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        episodes={episodes}
        freeCount={freeCount}
        unlockedIds={unlockedIds}
        defaultCost={defaultCost}
      />
    </View>
  );
}
