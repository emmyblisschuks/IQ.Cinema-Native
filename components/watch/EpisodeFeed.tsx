// components/watch/EpisodeFeed.tsx
//
// The vertical watch experience for one title, TikTok style: swipe up and the
// next episode slides in under your thumb, swipe down for the previous one.
// After the last episode the feed wraps back to the first, and a video that
// ends advances on its own.
//
// Every published episode of the title is loaded up front (like the web feed),
// so a swipe never waits on the network. Each episode has:
//   • VideoPlayer — full-screen with scrub bar + controls
//   • ActionRail — save / comments / share / episodes
//   • PlayerTopBar — back + EP badge + speed + more
//   • Sheets — CommentsSheet, SpeedSheet, MoreSheet, TitleDetailsSheet, EpisodeTray

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StatusBar, View, type LayoutChangeEvent } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { VideoPlayer } from "@/components/watch/VideoPlayer";
import { ActionRail } from "@/components/watch/ActionRail";
import { PlayerTopBar } from "@/components/watch/PlayerTopBar";
import { CommentsSheet } from "@/components/watch/CommentsSheet";
import { SpeedSheet } from "@/components/watch/SpeedSheet";
import { MoreSheet } from "@/components/watch/MoreSheet";
import { TitleDetailsSheet } from "@/components/watch/TitleDetailsSheet";
import { EpisodeTray, type TrayEpisode } from "@/components/watch/EpisodeTray";
import { SwipePager } from "@/components/shared/SwipePager";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { startDownload } from "@/lib/offline";
import { storyboardPublicUrl } from "@/lib/storyboard";
import { shareLink } from "@/lib/share";
import { reportPlay } from "@/lib/reportPlay";
import { useI18n } from "@/hooks/useI18n";

const supabase = createClient();

type Episode = {
  id: string;
  episode_number: number;
  name: string | null;
  unlock_cost_coins: number | null;
  // Storage object path inside the private `videos` bucket (the column is
  // named video_url, but it holds a path, not a URL — same as the web app).
  video_url: string | null;
  video_height: number | null;
  thumbnail_url: string | null;
  // Counts
  comment_count: number;
  share_count: number;
  save_count: number;
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

type Engagement = { saved: boolean; saveCount: number; commentCount: number; shareCount: number };

const EPISODE_COLS =
  "id, episode_number, name, unlock_cost_coins, video_url, video_height, thumbnail_url, comment_count, share_count, save_count";

async function loadFeed(initialEpisodeId: string) {
  const { data: seed } = await supabase.from("episodes").select("title_id").eq("id", initialEpisodeId).single();
  if (!seed) return null;
  const titleId = (seed as { title_id: string }).title_id;

  const [epsRes, titleRes, settingsRes] = await Promise.all([
    supabase.from("episodes").select(EPISODE_COLS).eq("title_id", titleId).eq("status", "published").order("episode_number", { ascending: true }),
    supabase
      .from("titles")
      .select("id, slug, title, synopsis, poster_url, content_rating, total_unique_views, free_episode_count")
      .eq("id", titleId)
      .single(),
    supabase.from("platform_settings").select("default_free_episodes, default_episode_unlock_coins").single(),
  ]);
  if (epsRes.error || titleRes.error || !titleRes.data) return null;

  let episodes = (epsRes.data ?? []) as Episode[];
  // A deep link to an episode that isn't published yet (creator preview) must
  // still open it.
  if (!episodes.some((e) => e.id === initialEpisodeId)) {
    const { data: own } = await supabase.from("episodes").select(EPISODE_COLS).eq("id", initialEpisodeId).single();
    if (own) episodes = [...episodes, own as Episode].sort((a, b) => a.episode_number - b.episode_number);
  }
  if (!episodes.length) return null;

  const settings = settingsRes.data as { default_free_episodes: number; default_episode_unlock_coins: number } | null;
  const title: TitleMeta = {
    ...(titleRes.data as Omit<TitleMeta, "default_episode_unlock_coins">),
    default_episode_unlock_coins: settings?.default_episode_unlock_coins ?? 30,
    free_episode_count: (titleRes.data as { free_episode_count: number | null }).free_episode_count ?? settings?.default_free_episodes ?? 4,
  };
  return { episodes, title };
}

async function getSignedVideoUrl(videoPath: string) {
  if (/^https?:\/\//i.test(videoPath)) return videoPath;
  const { data, error } = await supabase.storage.from("videos").createSignedUrl(videoPath, 60 * 60 * 2);
  if (error || !data) return null;
  return data.signedUrl;
}

export function EpisodeFeed({ initialEpisodeId }: { initialEpisodeId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet(user?.id);

  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [title, setTitle] = useState<TitleMeta | null>(null);
  const [activeId, setActiveId] = useState(initialEpisodeId);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pageH, setPageH] = useState(0);
  const [advanceKey, setAdvanceKey] = useState(0);

  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [urlRetry, setUrlRetry] = useState(0);

  // Locks
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Engagement, per episode (counts start from the server, then this viewer's taps)
  const [engagement, setEngagement] = useState<Record<string, Engagement>>({});
  const savingRef = useRef(false);

  // Watch-time reporting: count only continuous playback, report the
  // cumulative total every ~10s of watching.
  const watchSecondsRef = useRef(0);
  const lastPlayheadRef = useRef<number | null>(null);
  const lastReportedRef = useRef(0);
  const prevActiveRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  // Sheet state
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const sheetOpen = commentsOpen || speedOpen || moreOpen || detailsOpen || trayOpen;

  // ─── Load every episode of the title ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    loadFeed(initialEpisodeId)
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setLoadFailed(true);
          return;
        }
        setEpisodes(res.episodes);
        setTitle(res.title);
        setEngagement((prev) => {
          const next = { ...prev };
          for (const e of res.episodes) {
            if (!next[e.id]) next[e.id] = { saved: false, saveCount: e.save_count ?? 0, commentCount: e.comment_count ?? 0, shareCount: e.share_count ?? 0 };
          }
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initialEpisodeId, reloadKey]);

  const idsKey = (episodes ?? []).map((e) => e.id).join(",");

  // This viewer's paid unlocks and saves across the whole title — one lookup
  // each, not one per swipe.
  useEffect(() => {
    if (!user || !idsKey) {
      setUnlockedIds(new Set());
      return;
    }
    let ignore = false;
    const ids = idsKey.split(",");
    (async () => {
      const [{ data: unlocks }, { data: saves }] = await Promise.all([
        supabase.from("episode_unlocks").select("episode_id").eq("user_id", user.id).in("episode_id", ids),
        supabase.from("episode_saves").select("episode_id").eq("user_id", user.id).in("episode_id", ids),
      ]);
      if (ignore) return;
      setUnlockedIds(new Set((unlocks ?? []).map((u) => u.episode_id as string)));
      const savedSet = new Set((saves ?? []).map((s) => s.episode_id as string));
      setEngagement((prev) => {
        const next = { ...prev };
        for (const id of ids) if (next[id]) next[id] = { ...next[id], saved: savedSet.has(id) };
        return next;
      });
    })();
    return () => {
      ignore = true;
    };
  }, [user?.id, idsKey]);

  const freeCount = title?.free_episode_count ?? 4;
  const isUnlocked = useCallback((e: Episode) => e.episode_number <= freeCount || unlockedIds.has(e.id), [freeCount, unlockedIds]);

  // Circular neighbours, so the wrap-around episode is ready before the swipe.
  const neighbours = useCallback(
    (list: Episode[], idx: number) => {
      const n = list.length;
      if (n < 2) return [];
      return [list[(idx - 1 + n) % n], list[(idx + 1) % n]];
    },
    []
  );

  // Signed URL for the active episode plus its neighbours.
  useEffect(() => {
    if (!episodes) return;
    const idx = episodes.findIndex((e) => e.id === activeId);
    if (idx < 0) return;
    const targets = [episodes[idx], ...neighbours(episodes, idx)].filter(
      (e) => !!e.video_url && isUnlocked(e) && !videoUrls[e.id]
    );
    if (!targets.length) return;
    let ignore = false;
    (async () => {
      const entries = await Promise.all(targets.map(async (e) => [e.id, await getSignedVideoUrl(e.video_url!)] as const));
      if (ignore) return;
      setVideoUrls((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
      setFailedIds((prev) => {
        const next = new Set(prev);
        for (const [id, url] of entries) {
          if (url) next.delete(id);
          else next.add(id);
        }
        return next;
      });
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, episodes, isUnlocked, urlRetry]);

  const refreshVideoUrl = useCallback(
    async (episodeId: string) => {
      const e = episodes?.find((x) => x.id === episodeId);
      if (!e?.video_url) return undefined;
      const signed = await getSignedVideoUrl(e.video_url);
      if (signed) setVideoUrls((prev) => ({ ...prev, [episodeId]: signed }));
      return signed ?? undefined;
    },
    [episodes]
  );

  // New episode → flush what the previous one watched, restart the counters.
  useEffect(() => {
    const prev = prevActiveRef.current;
    if (prev && prev !== activeId && watchSecondsRef.current > lastReportedRef.current) {
      void reportPlay(userIdRef.current, prev, watchSecondsRef.current);
    }
    prevActiveRef.current = activeId;
    watchSecondsRef.current = 0;
    lastPlayheadRef.current = null;
    lastReportedRef.current = 0;
    setUnlockError(null);
  }, [activeId]);

  // Called ~4x/second with the playhead. Only small forward steps count as
  // watching, so seeks and scrubbing don't inflate watch time.
  const reportProgress = useCallback((episodeId: string, playhead: number, force = false) => {
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
    void reportPlay(userIdRef.current, episodeId, watched);
  }, []);

  // Flush whatever is unreported when leaving the screen.
  useEffect(
    () => () => {
      const id = prevActiveRef.current;
      if (id && watchSecondsRef.current > lastReportedRef.current) {
        void reportPlay(userIdRef.current, id, watchSecondsRef.current);
      }
    },
    []
  );

  const ep = episodes?.find((e) => e.id === activeId) ?? null;

  // ─── Coin unlock ───────────────────────────────────────────────────────────
  async function handleUnlock() {
    if (!user) {
      router.push(`/auth/login?next=/watch/${activeId}` as never);
      return;
    }
    if (!ep || !title || unlocking) return;
    const cost = ep.unlock_cost_coins ?? title.default_episode_unlock_coins;
    if ((wallet?.coin_balance ?? 0) < cost) {
      setUnlockError(t("watch.needCoins", { n: cost }));
      return;
    }
    setUnlocking(true);
    setUnlockError(null);
    const { data, error } = await supabase.rpc("unlock_episode", { p_user_id: user.id, p_episode_id: ep.id });
    setUnlocking(false);
    if (error || !data?.ok) {
      setUnlockError(data?.error === "insufficient_coins" ? t("watch.notEnoughCoins") : error?.message ?? t("watch.unlockFailed"));
      return;
    }
    await refreshWallet();
    setUnlockedIds((prev) => new Set(prev).add(ep.id));
  }

  // ─── Save ──────────────────────────────────────────────────────────────────
  async function toggleSave() {
    if (!user || !ep) {
      router.push("/auth/login" as never);
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    const id = ep.id;
    const next = !engagement[id]?.saved;
    const bump = (d: number, saved: boolean) =>
      setEngagement((prev) => ({ ...prev, [id]: { ...prev[id], saved, saveCount: Math.max(0, (prev[id]?.saveCount ?? 0) + d) } }));
    // Optimistic: flip the bookmark and bump the count right away.
    bump(next ? 1 : -1, next);
    let failed = false;
    try {
      const { error } = next
        ? await supabase.from("episode_saves").upsert({ user_id: user.id, episode_id: id }, { onConflict: "user_id,episode_id", ignoreDuplicates: true })
        : await supabase.from("episode_saves").delete().eq("user_id", user.id).eq("episode_id", id);
      failed = !!error;
    } catch {
      failed = true;
    } finally {
      savingRef.current = false;
    }
    if (failed) bump(next ? -1 : 1, !next);
  }

  // ─── Share ─────────────────────────────────────────────────────────────────
  async function handleShare() {
    if (!ep || !title) return;
    const id = ep.id;
    // Opens the Android share manager (iOS share sheet) instead of copying.
    const shared = await shareLink({ title: title.title, path: `/watch/${title.slug}/ep-${ep.episode_number}` });
    if (!shared) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEngagement((prev) => ({ ...prev, [id]: { ...prev[id], shareCount: (prev[id]?.shareCount ?? 0) + 1 } }));
    // Server-side counter (episodes isn't client-writable).
    supabase.rpc("record_episode_share", { p_episode_id: id }).then(({ data }) => {
      if (data?.ok && typeof data.share_count === "number") {
        setEngagement((prev) => ({ ...prev, [id]: { ...prev[id], shareCount: data.share_count } }));
      }
    });
  }

  // ─── Download ──────────────────────────────────────────────────────────────
  async function handleDownload() {
    if (!ep?.video_url || !title) return;
    await startDownload(supabase, {
      episode_id: ep.id,
      title_id: title.id,
      title: title.title,
      poster_url: title.poster_url,
      episode_number: ep.episode_number,
      video_path: ep.video_url,
    });
  }

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loadFailed) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-black px-10">
        <Text className="font-display text-center text-[20px] font-semibold text-white">{t("watch.loadFailed")}</Text>
        <Text className="text-center text-[14px] text-white/70">{t("foryou.checkConnection")}</Text>
        <Button size="lg" className="w-full" onPress={() => setReloadKey((k) => k + 1)}>
          {t("common.retry")}
        </Button>
        <Button variant="ghost" onPress={goBack}>
          <Text className="text-[14px] text-white/50">{t("common.backArrow")}</Text>
        </Button>
      </View>
    );
  }

  if (!episodes || !title || !ep) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  const trayEpisodes: TrayEpisode[] = episodes.map((e) => ({
    id: e.id,
    episode_number: e.episode_number,
    name: e.name,
    unlock_cost_coins: e.unlock_cost_coins,
  }));
  const single = episodes.length === 1;

  function renderSlide(item: Episode, { active }: { active: boolean }) {
    const art = item.thumbnail_url ?? title?.poster_url ?? null;

    // Neighbours are a still frame only, so one video decodes at a time.
    if (!active) {
      return (
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {art ? <Image source={{ uri: art }} style={{ flex: 1, opacity: 0.7 }} contentFit="cover" /> : null}
        </View>
      );
    }

    if (!isUnlocked(item)) {
      const cost = item.unlock_cost_coins ?? title!.default_episode_unlock_coins;
      return (
        <View className="flex-1 items-center justify-center gap-5 bg-black px-10">
          <Text className="font-display text-center text-[22px] font-semibold text-white">EP.{item.episode_number} is locked</Text>
          <Text className="text-center text-[14px] text-white/70">Unlock this episode for {cost} coins to keep watching.</Text>
          {unlockError ? <Text className="text-center text-[13px] text-crimson">{unlockError}</Text> : null}
          <Button size="lg" className="w-full" disabled={unlocking} onPress={handleUnlock}>
            {unlocking ? t("watch.unlocking") : t("watch.unlockFor", { n: cost })}
          </Button>
          <Button variant="ghost" onPress={() => router.push("/wallet" as never)}>
            <Text className="text-[14px] text-white/70 underline">{t("watch.getMoreCoins")}</Text>
          </Button>
          <Button variant="ghost" onPress={goBack}>
            <Text className="text-[14px] text-white/50">{t("common.backArrow")}</Text>
          </Button>
        </View>
      );
    }

    if (!item.video_url || failedIds.has(item.id)) {
      return (
        <View className="flex-1 items-center justify-center gap-4 bg-black px-10">
          <Text className="text-center text-[15px] text-white/80">{!item.video_url ? t("watch.noVideo") : t("watch.videoLoadFailed")}</Text>
          <Button size="lg" className="w-full" onPress={() => setUrlRetry((k) => k + 1)}>
            {t("common.retry")}
          </Button>
          <Button variant="ghost" onPress={goBack}>
            <Text className="text-[14px] text-white/50">{t("common.backArrow")}</Text>
          </Button>
        </View>
      );
    }

    const eng = engagement[item.id];
    return (
      <VideoPlayer
        key={item.id}
        src={videoUrls[item.id]}
        autoPlay
        loop={single}
        speed={speed}
        posterUrl={art ?? undefined}
        title={item.name ?? title!.title}
        synopsis={title!.synopsis}
        storyboardUrl={!/^https?:\/\//i.test(item.video_url) ? storyboardPublicUrl(supabase, item.video_url) : null}
        onOpenDetails={() => setDetailsOpen(true)}
        onTimeUpdate={(s) => reportProgress(item.id, s)}
        onEnded={() => {
          reportProgress(item.id, lastPlayheadRef.current ?? 0, true);
          // Autoplay the next episode (wraps to the first after the last).
          if (!single) setAdvanceKey((k) => k + 1);
        }}
        onRequestFreshSrc={() => refreshVideoUrl(item.id)}
        topBar={
          <PlayerTopBar
            episodeNumber={item.episode_number}
            speed={speed}
            onBack={goBack}
            onOpenTitle={() => setDetailsOpen(true)}
            onOpenSpeed={() => setSpeedOpen(true)}
            onOpenMore={() => setMoreOpen(true)}
          />
        }
        actionRail={(railBottom) => (
          <ActionRail
            saved={eng?.saved ?? false}
            saveCount={eng?.saveCount ?? item.save_count ?? 0}
            onToggleSave={toggleSave}
            commentCount={eng?.commentCount ?? item.comment_count ?? 0}
            onOpenComments={() => setCommentsOpen(true)}
            shareCount={eng?.shareCount ?? item.share_count ?? 0}
            onShare={handleShare}
            onOpenEpisodes={() => setTrayOpen(true)}
            bottom={railBottom}
          />
        )}
      />
    );
  }

  const activeEng = engagement[ep.id];

  return (
    <View className="flex-1 bg-black" onLayout={(e: LayoutChangeEvent) => setPageH(Math.round(e.nativeEvent.layout.height))}>
      <StatusBar hidden />
      <SwipePager
        items={episodes}
        idOf={(e) => e.id}
        activeId={activeId}
        onChange={setActiveId}
        loop
        height={pageH}
        disabled={sheetOpen}
        advanceKey={advanceKey}
        renderSlide={renderSlide}
      />

      <CommentsSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        episodeId={ep.id}
        count={activeEng?.commentCount ?? ep.comment_count ?? 0}
        onCountChange={(n) => setEngagement((prev) => ({ ...prev, [ep.id]: { ...prev[ep.id], commentCount: n } }))}
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
        episodes={trayEpisodes}
        currentEpisodeId={ep.id}
        freeCount={freeCount}
        unlockedIds={unlockedIds}
        defaultCost={title.default_episode_unlock_coins}
        onSelect={(id) => setActiveId(id)}
      />
    </View>
  );
}
