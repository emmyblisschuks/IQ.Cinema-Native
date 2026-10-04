// components/watch/EpisodeFeed.tsx
//
// The vertical watch experience. One episode is displayed at a time; swiping
// up/down advances to the next/previous published episode. Each episode has:
//   • VideoPlayer — full-screen with scrub bar + controls
//   • ActionRail — save / comments / share / episodes
//   • PlayerTopBar — back + EP badge + speed + more
//   • Sheets — CommentsSheet, SpeedSheet, MoreSheet, TitleDetailsSheet, EpisodeTray

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  StatusBar,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useUnlockedEpisodeIds } from "@/hooks/useUnlockedEpisodes";
import { VideoPlayer } from "@/components/watch/VideoPlayer";
import { ActionRail } from "@/components/watch/ActionRail";
import { PlayerTopBar } from "@/components/watch/PlayerTopBar";
import { CommentsSheet } from "@/components/watch/CommentsSheet";
import { SpeedSheet } from "@/components/watch/SpeedSheet";
import { MoreSheet } from "@/components/watch/MoreSheet";
import { TitleDetailsSheet } from "@/components/watch/TitleDetailsSheet";
import { EpisodeTray, type TrayEpisode } from "@/components/watch/EpisodeTray";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { startDownload } from "@/lib/offline";
import { storyboardPublicUrl } from "@/lib/storyboard";
import { WEB_ORIGIN } from "@/lib/links";
import { getDeviceId } from "@/lib/device";

const supabase = createClient();

// How far the user must drag before a swipe is committed.
const SWIPE_THRESHOLD = 80;
// Pixels per ms a flick must reach to qualify as a swipe.
const VELOCITY_THRESHOLD = 0.4;

type Episode = {
  id: string;
  episode_number: number;
  name: string | null;
  unlock_cost_coins: number | null;
  // Storage object path inside the private `videos` bucket (the column is
  // named video_url, but it holds a path, not a URL — same as the web app).
  video_url: string | null;
  video_height: number | null;
  // Counts
  comment_count: number;
  share_count: number;
};

type TitleMeta = {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  poster_url: string | null;
  content_rating: string;
  total_unique_views: number;
  free_episode_count: number | null;
  default_episode_unlock_coins: number;
};

async function loadEpisodeAndTitle(episodeId: string) {
  const [epRes, settingsRes] = await Promise.all([
    supabase
      .from("episodes")
      .select("id, episode_number, name, unlock_cost_coins, video_url, video_height, comment_count, share_count, title_id")
      .eq("id", episodeId)
      .single(),
    supabase.from("platform_settings").select("default_free_episodes, default_episode_unlock_coins").single(),
  ]);

  if (epRes.error || !epRes.data) return null;
  const ep = epRes.data as Episode & { title_id: string };

  const titleRes = await supabase
    .from("titles")
    .select("id, slug, title, synopsis, poster_url, content_rating, total_unique_views, free_episode_count")
    .eq("id", ep.title_id)
    .single();

  if (titleRes.error || !titleRes.data) return null;

  const settings = settingsRes.data as { default_free_episodes: number; default_episode_unlock_coins: number } | null;

  const title: TitleMeta = {
    ...(titleRes.data as Omit<TitleMeta, "default_episode_unlock_coins">),
    default_episode_unlock_coins: settings?.default_episode_unlock_coins ?? 30,
    free_episode_count: (titleRes.data as { free_episode_count: number | null }).free_episode_count ?? settings?.default_free_episodes ?? 4,
  };

  return { ep, title };
}

async function loadSiblings(titleId: string) {
  const { data } = await supabase
    .from("episodes")
    .select("id, episode_number, name, unlock_cost_coins")
    .eq("title_id", titleId)
    .eq("status", "published")
    .order("episode_number", { ascending: true });
  return (data ?? []) as TrayEpisode[];
}

async function getSignedVideoUrl(videoPath: string) {
  if (/^https?:\/\//i.test(videoPath)) return videoPath;
  const { data, error } = await supabase.storage
    .from("videos")
    .createSignedUrl(videoPath, 60 * 60 * 2);
  if (error || !data) return null;
  return data.signedUrl;
}

// Mirrors the web app's reportPlay: record_play(p_user_id, p_device_id,
// p_episode_id, p_watched_seconds) validates and rate-limits server-side.
async function reportPlay(userId: string | null, episodeId: string, watchedSeconds: number) {
  const deviceId = await getDeviceId();
  const { data, error } = await supabase.rpc("record_play", {
    p_user_id: userId,
    p_device_id: deviceId || null,
    p_episode_id: episodeId,
    p_watched_seconds: Math.max(0, Math.floor(watchedSeconds)),
  });
  if (error) console.warn("record_play failed", error.message);
  else if (data && data.ok === false) console.warn("record_play rejected", data.error);
}

export function EpisodeFeed({ initialEpisodeId }: { initialEpisodeId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet(user?.id);

  const [episodeId, setEpisodeId] = useState(initialEpisodeId);
  const [ep, setEp] = useState<Episode | null>(null);
  const [title, setTitle] = useState<TitleMeta | null>(null);
  const [siblings, setSiblings] = useState<TrayEpisode[]>([]);
  const [src, setSrc] = useState<string | undefined>(undefined);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [storyboardUrl, setStoryboardUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Locks
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Counts
  const [commentCount, setCommentCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);

  // Engagement
  const [saved, setSaved] = useState(false);
  // Watch-time reporting (same approach as the web feed): count only
  // continuous playback, report the cumulative total every ~10s of watching.
  const watchSecondsRef = useRef(0);
  const lastPlayheadRef = useRef<number | null>(null);
  const lastReportedRef = useRef(0);
  const epIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  // Sheet state
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [trayLoaded, setTrayLoaded] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Swipe animation
  const translateY = useRef(new Animated.Value(0)).current;
  const navigating = useRef(false);

  const unlockedIds = useUnlockedEpisodeIds(
    siblings.map((s) => s.id),
    trayLoaded
  );

  // ─── Load episode ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSrc(undefined);
    setVideoError(null);
    setLoadFailed(false);
    setEp(null);
    setLocked(false);
    setUnlockError(null);
    watchSecondsRef.current = 0;
    lastPlayheadRef.current = null;
    lastReportedRef.current = 0;
    epIdRef.current = episodeId;

    loadEpisodeAndTitle(episodeId).then(async (res) => {
      if (cancelled || !res) { if (!cancelled) { setLoadFailed(true); setLoading(false); } return; }
      const { ep: loaded, title: loadedTitle } = res;
      if (!cancelled) {
        setEp(loaded);
        setTitle(loadedTitle);
        setCommentCount(loaded.comment_count);
        setShareCount(loaded.share_count);
        setLoading(false);
      }

      // Is this episode locked for this viewer?
      const isFree = loaded.episode_number <= (loadedTitle.free_episode_count ?? 4);
      let hasUnlock = false;
      if (!isFree && user) {
        const { data: unlockRow } = await supabase
          .from("episode_unlocks")
          .select("id")
          .eq("episode_id", loaded.id)
          .eq("user_id", user.id)
          .maybeSingle();
        hasUnlock = !!unlockRow;
      }
      if (!cancelled) setLocked(!isFree && !hasUnlock);

      // Load sibling episodes for the tray.
      loadSiblings(loadedTitle.id).then((s) => { if (!cancelled) setSiblings(s); });

      // Video URL — skip if locked.
      if (!isFree && !hasUnlock) return;
      if (loaded.video_url) {
        const signed = await getSignedVideoUrl(loaded.video_url);
        if (!cancelled && signed) {
          setSrc(signed);
          if (!/^https?:\/\//i.test(loaded.video_url)) {
            setStoryboardUrl(storyboardPublicUrl(supabase, loaded.video_url));
          }
        } else if (!cancelled) {
          setVideoError("Couldn't load this video. Check your connection and try again.");
        }
      } else if (!cancelled) {
        setVideoError("This episode has no video yet.");
      }
    });

    return () => { cancelled = true; };
  }, [episodeId, user, reloadKey]);

  // Followstatus
  useEffect(() => {
    if (!user || !title) return;
    let ignore = false;
    supabase.rpc("get_title_user_state", { p_title_id: title.id }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      if (!ignore) setSaved(!!row?.is_following);
    });
    return () => { ignore = true; };
  }, [user, title]);

  // Called ~4x/second with the playhead. Only small forward steps count as
  // watching, so seeks and scrubbing don't inflate watch time.
  const reportProgress = useCallback((playhead: number, force = false) => {
    const id = epIdRef.current;
    if (!id) return;
    const prev = lastPlayheadRef.current;
    lastPlayheadRef.current = playhead;
    if (prev !== null) {
      const delta = playhead - prev;
      if (delta > 0 && delta <= 1.5) watchSecondsRef.current += delta;
    }
    const watched = watchSecondsRef.current;
    if (!force && watched - lastReportedRef.current < 10) return;
    if (force && watched === lastReportedRef.current) return;
    lastReportedRef.current = watched;
    void reportPlay(userIdRef.current, id, watched);
  }, []);

  // Flush whatever is unreported when leaving the screen.
  useEffect(() => () => {
    const id = epIdRef.current;
    if (id && watchSecondsRef.current > lastReportedRef.current) {
      void reportPlay(userIdRef.current, id, watchSecondsRef.current);
    }
  }, []);

  // ─── Coin unlock ───────────────────────────────────────────────────────────
  async function handleUnlock() {
    if (!user) { router.push(`/auth/login?next=/watch/${episodeId}` as never); return; }
    if (!ep || !title || unlocking) return;
    const cost = ep.unlock_cost_coins ?? title.default_episode_unlock_coins;
    if ((wallet?.coin_balance ?? 0) < cost) {
      setUnlockError(`Not enough coins — you need ${cost} coins.`);
      return;
    }
    setUnlocking(true);
    setUnlockError(null);
    const { data, error } = await supabase.rpc("unlock_episode", { p_user_id: user.id, p_episode_id: ep.id });
    setUnlocking(false);
    if (error || !data?.ok) {
      setUnlockError(data?.error === "insufficient_coins" ? "Not enough coins." : error?.message ?? "Couldn't unlock this episode.");
      return;
    }
    await refreshWallet();
    // Reload this episode so the signed URL is fetched.
    setEpisodeId((id) => id); // no-op re-trigger
    setLocked(false);
    // Force reload
    const signed = ep.video_url ? await getSignedVideoUrl(ep.video_url) : undefined;
    if (signed) { setSrc(signed); setStoryboardUrl(storyboardPublicUrl(supabase, ep.video_url!)); }
  }

  // ─── Save / follow ─────────────────────────────────────────────────────────
  async function toggleSave() {
    if (!user || !title) { router.push("/auth/login" as never); return; }
    const next = !saved;
    setSaved(next);
    supabase.rpc("set_titles_follow", { p_title_ids: [title.id], p_follow: next }).then(({ error }) => { if (error) setSaved(!next); });
  }

  // ─── Share ─────────────────────────────────────────────────────────────────
  async function handleShare() {
    if (!ep || !title) return;
    const url = `${WEB_ORIGIN}/watch/${title.slug}/ep-${ep.episode_number}`;
    await Clipboard.setStringAsync(url).catch(() => {});
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShareCount((n) => n + 1);
    // Server-side counter (episodes isn't client-writable).
    supabase.rpc("record_episode_share", { p_episode_id: ep.id }).then(({ data }) => {
      if (data?.ok && typeof data.share_count === "number") setShareCount(data.share_count);
    });
  }

  // ─── Download ──────────────────────────────────────────────────────────────
  async function handleDownload() {
    if (!ep?.video_url || !title) return;
    const fileName = `${title.title} - EP${ep.episode_number}.mp4`;
    await startDownload(supabase, { episode_id: ep.id, title_id: title.id, title: title.title, episode_number: ep.episode_number, video_path: ep.video_url });
  }

  // ─── Navigation between episodes ───────────────────────────────────────────
  const goToEpisode = useCallback((id: string) => {
    if (navigating.current || id === episodeId) return;
    navigating.current = true;
    // Flush remaining watch seconds for the episode we're leaving.
    if (watchSecondsRef.current > lastReportedRef.current && epIdRef.current) {
      void reportPlay(userIdRef.current, epIdRef.current, watchSecondsRef.current);
    }
    setEpisodeId(id);
    navigating.current = false;
  }, [ep, episodeId, title]);

  const currentIndex = siblings.findIndex((s) => s.id === episodeId);
  const prevId = currentIndex > 0 ? siblings[currentIndex - 1].id : null;
  const nextId = currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1].id : null;

  // Swipe-up goes to the next episode, swipe-down to the previous.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_: GestureResponderEvent, g: PanResponderGestureState) =>
        Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        // Resist swiping if there's no episode in that direction.
        const resistance = 0.3;
        const dy = g.dy > 0 ? g.dy * resistance : g.dy * resistance;
        translateY.setValue(dy);
      },
      onPanResponderRelease: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        const isSwipeUp = g.dy < -SWIPE_THRESHOLD || g.vy < -VELOCITY_THRESHOLD;
        const isSwipeDown = g.dy > SWIPE_THRESHOLD || g.vy > VELOCITY_THRESHOLD;

        if (isSwipeUp && nextId) {
          Animated.timing(translateY, { toValue: -600, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
            translateY.setValue(0);
            goToEpisode(nextId);
          });
        } else if (isSwipeDown && prevId) {
          Animated.timing(translateY, { toValue: 600, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
            translateY.setValue(0);
            goToEpisode(prevId);
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    })
  ).current;

  // Re-sign the video URL when it expires (expo-video fires an error event,
  // the VideoPlayer bubbles it up via onRequestFreshSrc).
  const handleRequestFreshSrc = useCallback(async () => {
    if (!ep?.video_url) return undefined;
    return (await getSignedVideoUrl(ep.video_url)) ?? undefined;
  }, [ep]);

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loadFailed) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-black px-10">
        <Text className="font-display text-center text-[20px] font-semibold text-white">Couldn't load this episode</Text>
        <Text className="text-center text-[14px] text-white/70">Check your connection and try again.</Text>
        <Button variant="gold" size="lg" className="w-full" onPress={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
        <Button variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <Text className="text-[14px] text-white/50">← Back</Text>
        </Button>
      </View>
    );
  }

  if (loading || !ep || !title) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (locked) {
    const cost = ep.unlock_cost_coins ?? title.default_episode_unlock_coins;
    return (
      <View className="flex-1 items-center justify-center gap-5 bg-black px-10">
        <Text className="font-display text-center text-[22px] font-semibold text-white">
          EP.{ep.episode_number} is locked
        </Text>
        <Text className="text-center text-[14px] text-white/70">
          Unlock this episode for {cost} coins to keep watching.
        </Text>
        {unlockError ? <Text className="text-center text-[13px] text-crimson">{unlockError}</Text> : null}
        <Button variant="gold" size="lg" className="w-full" disabled={unlocking} onPress={handleUnlock}>
          {unlocking ? "Unlocking…" : `Unlock for ${cost} coins`}
        </Button>
        <Button variant="ghost" onPress={() => router.push("/wallet" as never)}>
          <Text className="text-[14px] text-white/70 underline">Get more coins</Text>
        </Button>
        <Button variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <Text className="text-[14px] text-white/50">← Back</Text>
        </Button>
      </View>
    );
  }

  if (videoError && !src) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-black px-10">
        <Text className="text-center text-[15px] text-white/80">{videoError}</Text>
        <Button variant="gold" size="lg" className="w-full" onPress={() => setReloadKey((k) => k + 1)}>
          Try again
        </Button>
        <Button variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <Text className="text-[14px] text-white/50">← Back</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black" {...pan.panHandlers}>
      <StatusBar hidden />
      <Animated.View style={{ flex: 1, transform: [{ translateY }] }}>
        <VideoPlayer
          src={src}
          autoPlay
          speed={speed}
          posterUrl={title.poster_url ?? undefined}
          title={ep.name ?? title.title}
          synopsis={title.synopsis}
          storyboardUrl={storyboardUrl}
          onOpenDetails={() => setDetailsOpen(true)}
          onTimeUpdate={(s) => reportProgress(s)}
          onEnded={() => {
            reportProgress(lastPlayheadRef.current ?? 0, true);
            if (nextId) goToEpisode(nextId);
          }}
          onRequestFreshSrc={handleRequestFreshSrc}
          topBar={
            <PlayerTopBar
              episodeNumber={ep.episode_number}
              speed={speed}
              onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
              onOpenTitle={() => setDetailsOpen(true)}
              onOpenSpeed={() => setSpeedOpen(true)}
              onOpenMore={() => setMoreOpen(true)}
            />
          }
          actionRail={(railBottom) => (
            <ActionRail
              saved={saved}
              saveCount={0}
              onToggleSave={toggleSave}
              commentCount={commentCount}
              onOpenComments={() => setCommentsOpen(true)}
              shareCount={shareCount}
              onShare={handleShare}
              onOpenEpisodes={() => { setTrayLoaded(true); setTrayOpen(true); }}
              bottom={railBottom}
            />
          )}
        />
      </Animated.View>

      <CommentsSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        episodeId={ep.id}
        count={commentCount}
        onCountChange={setCommentCount}
      />
      <SpeedSheet open={speedOpen} onClose={() => setSpeedOpen(false)} speed={speed} onSelect={setSpeed} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} videoHeight={ep.video_height} onDownload={handleDownload} />
      <TitleDetailsSheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        titleId={title.id}
        title={title.title}
        synopsis={title.synopsis}
        views={title.total_unique_views}
        contentRating={title.content_rating}
        posterUrl={title.poster_url}
      />
      <EpisodeTray
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        episodes={siblings}
        currentEpisodeId={ep.id}
        freeCount={title.free_episode_count ?? 4}
        unlockedIds={unlockedIds}
        defaultCost={title.default_episode_unlock_coins}
        onSelect={goToEpisode}
      />
    </View>
  );
}
