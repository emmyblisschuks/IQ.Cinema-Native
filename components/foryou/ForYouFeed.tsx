// components/foryou/ForYouFeed.tsx
//
// The For You tab: a vertical, full-height pager of promo episodes (one video
// at a time) with For you / New / Trending / Collections tabs, search, the
// action rail, comments, episode tray and title details — same data
// (get_for_you_feed_v2) and behaviour as the web feed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Share, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { ChevronRight, Flame, Play } from "lucide-react-native";
import { createClient } from "@/lib/supabase/client";
import { storyboardPublicUrl } from "@/lib/storyboard";
import { reportPlay } from "@/lib/reportPlay";
import { titlePath, WEB_ORIGIN } from "@/lib/links";
import { formatCount } from "@/lib/format";
import { DEFAULT_CATEGORY, type Category } from "@/lib/categories";
import { EMPTY_COPY_KEY, parseForYouTab, rpcTabFor, type ForYouTab } from "@/lib/forYouTabs";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { Text } from "@/components/ui/Text";
import { VideoPlayer } from "@/components/watch/VideoPlayer";
import { ActionRail } from "@/components/watch/ActionRail";
import { CommentsSheet } from "@/components/watch/CommentsSheet";
import { EpisodeTray, type TrayEpisode } from "@/components/watch/EpisodeTray";
import { TitleDetailsSheet } from "@/components/watch/TitleDetailsSheet";
import { ForYouHeader } from "@/components/foryou/ForYouHeader";
import { ForYouSearch, type SearchPromo } from "@/components/foryou/ForYouSearch";

type PromoItem = SearchPromo;
type Engagement = { saved: boolean; saveCount: number; commentCount: number; shareCount: number };

const PAGE_SIZE = 8;

function engagementFor(item: PromoItem): Engagement {
  return {
    saved: false,
    saveCount: item.save_count ?? 0,
    commentCount: item.comment_count ?? 0,
    shareCount: item.share_count ?? 0,
  };
}

export function ForYouFeed() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ tab?: string; title?: string }>();
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  // The tab screen stays mounted under /watch/* — don't keep playing then.
  const focused = pathname === "/for-you" || pathname.startsWith("/for-you/");

  const [tab, setTab] = useState<ForYouTab>(() => parseForYouTab(params.tab));
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);

  const [items, setItems] = useState<PromoItem[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [engagement, setEngagement] = useState<Record<string, Engagement>>({});
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showTray, setShowTray] = useState(false);
  const [trayTitleId, setTrayTitleId] = useState<string | null>(null);
  const [trayEpisodes, setTrayEpisodes] = useState<TrayEpisode[]>([]);
  const [trayFreeCount, setTrayFreeCount] = useState(4);
  const [trayDefaultCost, setTrayDefaultCost] = useState(30);
  const [trayUnlockedIds, setTrayUnlockedIds] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [slideH, setSlideH] = useState(0);
  const [feedError, setFeedError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const listRef = useRef<FlatList<PromoItem>>(null);
  const savingRef = useRef<Set<string>>(new Set());
  const watchedRef = useRef(0);
  const lastPlayheadRef = useRef<number | null>(null);
  const lastReportedRef = useRef(0);
  const activeRef = useRef<string | null>(null);
  const injectedSlug = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;
  activeRef.current = activeId;
  // Offset pagination (a ranked list has no stable timestamp cursor) plus a
  // token so a slow response for a tab we've left can't overwrite this one.
  const offsetRef = useRef(0);
  const feedTokenRef = useRef(0);

  const seedEngagement = useCallback(
    (batch: PromoItem[]) => {
      setEngagement((prev) => {
        const next = { ...prev };
        for (const it of batch) if (!next[it.episode_id]) next[it.episode_id] = engagementFor(it);
        return next;
      });
      // Which of these the viewer already saved (so the bookmark is filled).
      const uid = userIdRef.current;
      if (uid && batch.length) {
        supabase
          .from("episode_saves")
          .select("episode_id")
          .eq("user_id", uid)
          .in("episode_id", batch.map((b) => b.episode_id))
          .then(({ data }) => {
            if (!data?.length) return;
            const savedIds = new Set(data.map((r) => r.episode_id as string));
            setEngagement((prev) => {
              const next = { ...prev };
              for (const id of savedIds) if (next[id]) next[id] = { ...next[id], saved: true };
              return next;
            });
          });
      }
    },
    [supabase]
  );

  const fetchPage = useCallback(
    async (offset: number): Promise<PromoItem[] | null> => {
      const { data, error } = await supabase.rpc("get_for_you_feed_v2", {
        p_tab: rpcTabFor(tab),
        p_limit: PAGE_SIZE,
        p_offset: offset,
        p_category: tab === "collections" ? category : null,
      });
      if (!error) return (data as PromoItem[]) ?? [];
      // v2 not deployed on this database yet: the original newest-first feed
      // still serves the default view, so For You never goes blank.
      if (tab === "for_you" && offset === 0) {
        const legacy = await supabase.rpc("get_for_you_feed", { p_limit: PAGE_SIZE, p_before: null });
        if (!legacy.error) return (legacy.data as PromoItem[]) ?? [];
      }
      console.warn("get_for_you_feed_v2 failed", error.message);
      return null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, category]
  );

  // First page — reruns whenever the tab or collection category changes.
  useEffect(() => {
    const token = ++feedTokenRef.current;
    setItems(null);
    setActiveId(null);
    setExhausted(false);
    setLoadingMore(false);
    setFeedError(false);
    setShowComments(false);
    setShowDetails(false);
    setShowTray(false);
    offsetRef.current = 0;
    (async () => {
      const batch = await fetchPage(0);
      if (token !== feedTokenRef.current) return;
      if (batch === null) {
        setFeedError(true);
        setItems([]);
        return;
      }
      offsetRef.current = batch.length;
      setItems(batch);
      if (batch[0]) setActiveId(batch[0].episode_id);
      seedEngagement(batch);
      if (batch.length < PAGE_SIZE) setExhausted(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category, reloadKey]);

  // Splice a promo in right after the current slide (or just scroll to it if
  // it's already in the feed) and make it the active one. Used by the
  // "Similar titles" tap and by search results.
  const injectPromo = useCallback(
    (row: PromoItem) => {
      let targetIdx = 0;
      setItems((prev) => {
        const cur = prev ?? [];
        const existing = cur.findIndex((i) => i.episode_id === row.episode_id);
        if (existing >= 0) {
          targetIdx = existing;
          return cur;
        }
        const idx = cur.findIndex((i) => i.episode_id === activeRef.current);
        const next = [...cur];
        const at = idx >= 0 ? idx + 1 : cur.length;
        next.splice(at, 0, row);
        targetIdx = at;
        return next;
      });
      seedEngagement([row]);
      setActiveId(row.episode_id);
      setTimeout(() => listRef.current?.scrollToIndex({ index: targetIdx, animated: false }), 60);
    },
    [seedEngagement]
  );

  // ?title=<slug> deep link (and similar-title taps) → fetch that title's
  // promo and splice it in.
  const injectBySlug = useCallback(
    async (slug: string) => {
      const { data } = await supabase.rpc("get_for_you_promo_by_slug", { p_slug: slug });
      const row = (Array.isArray(data) ? data[0] : data) as PromoItem | undefined;
      if (row) injectPromo(row);
    },
    [supabase, injectPromo]
  );

  useEffect(() => {
    const slug = params.title;
    if (!slug || slug === injectedSlug.current || !items) return;
    injectedSlug.current = slug;
    injectBySlug(slug);
    router.setParams({ title: undefined } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.title, items]);

  // Signed URL for the active slide + its immediate neighbours.
  useEffect(() => {
    if (!items || !activeId) return;
    const idx = items.findIndex((i) => i.episode_id === activeId);
    if (idx < 0) return;
    const targets = [items[idx - 1], items[idx], items[idx + 1]].filter(
      (i): i is PromoItem => !!i && !!i.video_url && !videoUrls[i.episode_id]
    );
    if (!targets.length) return;
    let ignore = false;
    (async () => {
      const entries = await Promise.all(
        targets.map(async (it) => {
          const path = it.video_url!;
          if (/^https?:\/\//i.test(path)) return [it.episode_id, path] as const;
          const { data } = await supabase.storage.from("videos").createSignedUrl(path, 60 * 60);
          return [it.episode_id, data?.signedUrl] as const;
        })
      );
      if (ignore) return;
      setVideoUrls((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
    })();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, items, supabase]);

  const refreshVideoUrl = useCallback(
    async (episodeId: string) => {
      const it = items?.find((i) => i.episode_id === episodeId);
      if (!it?.video_url) return undefined;
      if (/^https?:\/\//i.test(it.video_url)) return it.video_url;
      const { data } = await supabase.storage.from("videos").createSignedUrl(it.video_url, 60 * 60);
      if (data?.signedUrl) setVideoUrls((prev) => ({ ...prev, [episodeId]: data.signedUrl }));
      return data?.signedUrl;
    },
    [items, supabase]
  );

  // Within two of the end → fetch the next page.
  useEffect(() => {
    if (!items || !activeId || exhausted || loadingMore) return;
    const idx = items.findIndex((i) => i.episode_id === activeId);
    if (idx < items.length - 2) return;
    setLoadingMore(true);
    const token = feedTokenRef.current;
    fetchPage(offsetRef.current).then((batch) => {
      if (token !== feedTokenRef.current) return;
      if (!batch) {
        setLoadingMore(false);
        return;
      }
      offsetRef.current += batch.length;
      const existing = new Set(items.map((i) => i.episode_id));
      const fresh = batch.filter((i) => !existing.has(i.episode_id));
      if (fresh.length) {
        setItems((prev) => [...(prev ?? []), ...fresh]);
        seedEngagement(fresh);
      }
      if (batch.length < PAGE_SIZE) setExhausted(true);
      setLoadingMore(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, items, exhausted, loadingMore]);

  // New slide → restart watch-time accounting (flush the previous one first).
  const prevActiveRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevActiveRef.current;
    if (prev && prev !== activeId && watchedRef.current > lastReportedRef.current) {
      void reportPlay(userIdRef.current, prev, watchedRef.current);
    }
    prevActiveRef.current = activeId;
    watchedRef.current = 0;
    lastPlayheadRef.current = null;
    lastReportedRef.current = 0;
  }, [activeId]);

  function reportProgress(item: PromoItem, playhead: number, force = false) {
    const prev = lastPlayheadRef.current;
    lastPlayheadRef.current = playhead;
    if (prev !== null) {
      const delta = playhead - prev;
      if (delta > 0 && delta <= 1.5) watchedRef.current += delta;
    }
    if (!force && watchedRef.current - lastReportedRef.current < 10) return;
    if (force && watchedRef.current === lastReportedRef.current) return;
    lastReportedRef.current = watchedRef.current;
    void reportPlay(userIdRef.current, item.episode_id, watchedRef.current);
  }

  function goToNext(item: PromoItem) {
    if (!items) return;
    const idx = items.findIndex((i) => i.episode_id === item.episode_id);
    if (items[idx + 1]) {
      listRef.current?.scrollToIndex({ index: idx + 1, animated: true });
      setActiveId(items[idx + 1].episode_id);
    }
  }

  async function toggleSave(item: PromoItem) {
    if (!user) return router.push("/auth/login");
    if (savingRef.current.has(item.episode_id)) return;
    savingRef.current.add(item.episode_id);
    const next = !engagement[item.episode_id]?.saved;
    const bump = (d: number, saved: boolean) =>
      setEngagement((prev) => ({
        ...prev,
        [item.episode_id]: {
          ...prev[item.episode_id],
          saved,
          saveCount: Math.max(0, (prev[item.episode_id]?.saveCount ?? 0) + d),
        },
      }));
    bump(next ? 1 : -1, next);
    let failed = false;
    try {
      const { error } = next
        ? await supabase
            .from("episode_saves")
            .upsert({ user_id: user.id, episode_id: item.episode_id }, { onConflict: "user_id,episode_id", ignoreDuplicates: true })
        : await supabase.from("episode_saves").delete().eq("user_id", user.id).eq("episode_id", item.episode_id);
      failed = !!error;
    } catch {
      failed = true;
    } finally {
      savingRef.current.delete(item.episode_id);
    }
    if (failed) bump(next ? -1 : 1, !next);
  }

  async function handleShare(item: PromoItem) {
    const url = `${WEB_ORIGIN}${titlePath(item.slug)}`;
    const { data } = await supabase.rpc("record_episode_share", { p_episode_id: item.episode_id });
    setEngagement((prev) => ({
      ...prev,
      [item.episode_id]: {
        ...prev[item.episode_id],
        shareCount: data?.ok ? data.share_count : (prev[item.episode_id]?.shareCount ?? 0) + 1,
      },
    }));
    try {
      await Share.share({ message: `${item.title} — ${url}`, url, title: item.title });
    } catch {
      // dismissed
    }
  }

  async function openTray(item: PromoItem) {
    setShowTray(true);
    if (trayTitleId === item.title_id) return;
    setTrayTitleId(item.title_id);
    setTrayEpisodes([]);
    setTrayUnlockedIds(new Set());
    const [{ data: eps }, { data: ti }, { data: settings }] = await Promise.all([
      supabase
        .from("episodes")
        .select("id, episode_number, name, unlock_cost_coins")
        .eq("title_id", item.title_id)
        .eq("status", "published")
        .gt("episode_number", 0)
        .order("episode_number", { ascending: true }),
      supabase.from("titles").select("free_episode_count").eq("id", item.title_id).single(),
      supabase.from("platform_settings").select("default_free_episodes, default_episode_unlock_coins").single(),
    ]);
    setTrayEpisodes((eps as TrayEpisode[]) ?? []);
    setTrayFreeCount(ti?.free_episode_count ?? settings?.default_free_episodes ?? 4);
    setTrayDefaultCost(settings?.default_episode_unlock_coins ?? 30);
    const ids = (eps ?? []).map((e) => e.id);
    if (user && ids.length) {
      const { data: unlocks } = await supabase.from("episode_unlocks").select("episode_id").eq("user_id", user.id).in("episode_id", ids);
      setTrayUnlockedIds(new Set((unlocks ?? []).map((u) => u.episode_id)));
    }
  }

  // "Watch Full Movie" → the title's first episode in the normal player.
  async function openFullMovie(item: PromoItem) {
    const { data } = await supabase
      .from("episodes")
      .select("id")
      .eq("title_id", item.title_id)
      .eq("status", "published")
      .gt("episode_number", 0)
      .order("episode_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data?.id) router.push(`/watch/${data.id}` as never);
  }

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!items || !slideH) return;
      const idx = Math.round(e.nativeEvent.contentOffset.y / slideH);
      const it = items[Math.max(0, Math.min(items.length - 1, idx))];
      if (it) setActiveId(it.episode_id);
    },
    [items, slideH]
  );

  const header = (
    <ForYouHeader
      tab={tab}
      onTabChange={(next) => next !== tab && setTab(next)}
      category={category}
      onCategoryChange={setCategory}
      onSearch={() => setShowSearch(true)}
    />
  );

  if (!items) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {header}
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#fff" />
        </View>
      </View>
    );
  }

  const active = items.find((i) => i.episode_id === activeId) ?? items[0];

  function renderSlide(item: PromoItem) {
    const isActive = item.episode_id === activeId && focused && !showSearch;
    const eng = engagement[item.episode_id];
    const epLabel = item.total_episodes > 0 ? `EP.${Math.max(item.episode_number, 1)}/EP.${item.total_episodes}` : null;
    const art = item.thumbnail_url ?? item.poster_url;

    return (
      <View style={{ height: slideH, backgroundColor: "#000" }}>
        {isActive ? (
          <VideoPlayer
            src={videoUrls[item.episode_id]}
            autoPlay
            posterUrl={art ?? undefined}
            hideWatermark
            embedded
            onRequestFreshSrc={() => refreshVideoUrl(item.episode_id)}
            storyboardUrl={item.video_url && !/^https?:\/\//i.test(item.video_url) ? storyboardPublicUrl(supabase, item.video_url) : null}
            onTimeUpdate={(s) => reportProgress(item, s)}
            onEnded={() => {
              reportProgress(item, item.duration_seconds ?? lastPlayheadRef.current ?? 0, true);
              goToNext(item);
            }}
            bottomContent={
              <View className="gap-2">
                {tab === "trending" && item.feed_rank ? (
                  <View className="flex-row items-center gap-1 self-start rounded-full bg-pink px-2.5 py-1">
                    <Flame size={12} color="#fff" fill="#fff" />
                    <Text className="text-[11px] font-bold text-white">
                      #{item.feed_rank} Trending
                      {(item.recent_views ?? 0) > 0 ? (
                        <Text className="font-medium text-white/85"> · {formatCount(item.recent_views ?? 0)} this week</Text>
                      ) : null}
                    </Text>
                  </View>
                ) : item.is_new ? (
                  <View className="self-start rounded-[4px] bg-pink px-2 py-[3px]">
                    <Text className="text-[10px] font-extrabold uppercase text-white" style={{ letterSpacing: 1 }}>
                      {t("foryou.badgeNew")}
                    </Text>
                  </View>
                ) : null}

                <Pressable onPress={() => setShowDetails(true)} className="flex-row items-center gap-1 self-start" style={{ maxWidth: "78%" }}>
                  <Text numberOfLines={1} className="shrink font-display text-[17px] font-semibold text-white">
                    {item.title}
                  </Text>
                  <ChevronRight size={16} color="rgba(255,255,255,0.8)" />
                </Pressable>

                <View className="flex-row flex-wrap items-center gap-1.5">
                  {(item.tags ?? []).slice(0, 2).map((tag) => (
                    <View key={tag} className="rounded-full px-2.5 py-1" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
                      <Text className="text-[11px] font-medium text-white/90">{tag}</Text>
                    </View>
                  ))}
                  {epLabel ? <Text className="text-[12px] font-semibold text-white/80">{epLabel}</Text> : null}
                </View>

                {item.synopsis ? (
                  <Pressable onPress={() => setShowDetails(true)} style={{ maxWidth: "78%" }}>
                    <Text numberOfLines={2} className="text-[13px] leading-snug text-white/80">
                      {item.synopsis} <Text className="font-semibold text-white">{t("foryou.more")}</Text>
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            }
            cta={
              item.total_episodes > 1 ? (
                <Pressable onPress={() => openFullMovie(item)} className="h-11 w-full overflow-hidden rounded-md active:opacity-90">
                  <LinearGradient
                    colors={["#ff2a69", "#962d28"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    <Play size={16} color="#fff" fill="#fff" />
                    <Text className="text-[15px] font-semibold text-white">{t("foryou.watchFullMovie")}</Text>
                  </LinearGradient>
                </Pressable>
              ) : null
            }
            actionRail={(railBottom) => (
              <ActionRail
                saved={eng?.saved ?? false}
                saveCount={eng?.saveCount ?? item.save_count}
                onToggleSave={() => toggleSave(item)}
                commentCount={eng?.commentCount ?? item.comment_count}
                onOpenComments={() => setShowComments(true)}
                shareCount={eng?.shareCount ?? item.share_count}
                onShare={() => handleShare(item)}
                onOpenEpisodes={() => openTray(item)}
                bottom={railBottom}
              />
            )}
          />
        ) : (
          // Not the active slide: a static frame only, so one video decodes
          // at a time.
          <View style={{ flex: 1, backgroundColor: "#000" }}>
            {art ? <Image source={{ uri: art }} style={{ flex: 1, opacity: 0.7 }} contentFit="cover" /> : null}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }} onLayout={(e: LayoutChangeEvent) => setSlideH(Math.round(e.nativeEvent.layout.height))}>
      {header}
      <ForYouSearch
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={(row) => {
          setShowSearch(false);
          injectPromo(row);
        }}
      />

      {slideH > 0 && items.length > 0 ? (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(i) => i.episode_id}
          renderItem={({ item }) => renderSlide(item)}
          extraData={[activeId, videoUrls, engagement, focused, showSearch, tab, slideH]}
          pagingEnabled
          snapToInterval={slideH}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: slideH, offset: slideH * index, index })}
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={(e) => {
            // Short drags with no momentum still settle on a page.
            if (e.nativeEvent.velocity && Math.abs(e.nativeEvent.velocity.y) < 0.05) onScrollEnd(e);
          }}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          removeClippedSubviews
        />
      ) : null}

      {!items.length ? (
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Text className="text-center text-[14px] text-white/70">{feedError ? t("foryou.searchUnavailable") : t(EMPTY_COPY_KEY[tab])}</Text>
          {feedError ? (
            <Pressable onPress={() => setReloadKey((k) => k + 1)} className="mt-4 rounded-md bg-pink px-5 py-2.5">
              <Text className="text-[14px] font-semibold text-white">{t("common.retry")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {active ? (
        <>
          <CommentsSheet
            open={showComments}
            onClose={() => setShowComments(false)}
            episodeId={active.episode_id}
            count={engagement[active.episode_id]?.commentCount ?? active.comment_count}
            onCountChange={(n) =>
              setEngagement((prev) => ({ ...prev, [active.episode_id]: { ...prev[active.episode_id], commentCount: n } }))
            }
          />
          <EpisodeTray
            open={showTray}
            onClose={() => setShowTray(false)}
            episodes={trayEpisodes}
            freeCount={trayFreeCount}
            unlockedIds={trayUnlockedIds}
            defaultCost={trayDefaultCost}
          />
          <TitleDetailsSheet
            open={showDetails}
            onClose={() => setShowDetails(false)}
            titleId={active.title_id}
            title={active.title}
            synopsis={active.synopsis}
            views={active.total_unique_views}
            contentRating={active.content_rating}
            posterUrl={active.poster_url}
            onSelectSimilar={(ti) => injectBySlug(ti.slug)}
          />
        </>
      ) : null}
    </View>
  );
}
