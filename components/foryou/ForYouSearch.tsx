// components/foryou/ForYouSearch.tsx
//
// Full-screen search over the For You feed: recent searches + "trending now"
// when empty, debounced filter-as-you-type with highlighted matches otherwise.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Keyboard, Modal, Pressable, TextInput, View } from "react-native";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Clock, Search, X } from "lucide-react-native";
import { createClient } from "@/lib/supabase/client";
import { formatEpisodeCount } from "@/lib/format";
import { Text } from "@/components/ui/Text";
import { useI18n } from "@/hooks/useI18n";

// Same row shape the feed uses (get_for_you_feed_v2 / search_for_you_promos).
export type SearchPromo = {
  episode_id: string;
  episode_number: number;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  save_count: number;
  comment_count: number;
  share_count: number;
  title_id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  poster_url: string | null;
  content_rating: string | null;
  category: string | null;
  tags: string[] | null;
  total_episodes: number;
  total_unique_views: number;
  published_at: string | null;
  is_new?: boolean;
  feed_rank?: number;
  recent_views?: number;
  match_source?: string;
};

const RECENT_KEY = "iqc:foryou:recent-searches";
const MAX_RECENT = 6;
const DEBOUNCE_MS = 150;

async function readRecent(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => typeof s === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  AsyncStorage.setItem(RECENT_KEY, JSON.stringify(list)).catch(() => {});
}

function tokenize(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().split(/\s+/).filter(Boolean))).slice(0, 6);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Accent-coloured matched words, like the highlight in a chat app's search.
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>;
  const re = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "ig");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} className="font-bold text-pink">
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </>
  );
}

// The part of the synopsis around the first match, so a deep hit is visible.
function snippetFor(synopsis: string | null, tokens: string[]): string {
  if (!synopsis) return "";
  const flat = synopsis.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  let first = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i >= 0 && (first < 0 || i < first)) first = i;
  }
  if (first < 0) return flat.slice(0, 140);
  const start = Math.max(0, first - 45);
  const end = Math.min(flat.length, start + 150);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

function ResultRow({ item, tokens, onPick }: { item: SearchPromo; tokens: string[]; onPick: (item: SearchPromo) => void }) {
  const { t } = useI18n();
  const art = item.poster_url ?? item.thumbnail_url;
  const snippet = snippetFor(item.synopsis, tokens);
  return (
    <Pressable onPress={() => onPick(item)} className="flex-row items-start gap-3 px-4 py-2.5 active:bg-white/10">
      <View className="overflow-hidden rounded-md" style={{ width: 60, height: 84, backgroundColor: "rgba(255,255,255,0.1)" }}>
        {art ? <Image source={{ uri: art }} style={{ width: 60, height: 84 }} contentFit="cover" /> : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-semibold text-white">
          <Highlight text={item.title} tokens={tokens} />
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[12px] text-white/55">
          {[item.tags?.[0], item.total_episodes > 0 ? formatEpisodeCount(item.total_episodes, t) : null].filter(Boolean).join(" · ")}
        </Text>
        {snippet ? (
          <Text numberOfLines={2} className="mt-1 text-[13px] leading-snug text-white/70">
            <Highlight text={snippet} tokens={tokens} />
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ForYouSearch({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: SearchPromo) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<TextInput>(null);
  const tokenRef = useRef(0);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPromo[]>([]);
  const [settledQuery, setSettledQuery] = useState(""); // the query `results` belong to
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<SearchPromo[]>([]);

  // Fresh state every time the overlay opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSettledQuery("");
    setFailed(false);
    readRecent().then(setRecent);
    const id = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(id);
  }, [open]);

  // "Trending now" suggestions for the empty state — same ranking as the tab.
  useEffect(() => {
    if (!open || popular.length) return;
    supabase
      .rpc("get_for_you_feed_v2", { p_tab: "trending", p_limit: 6, p_offset: 0, p_category: null })
      .then(({ data }) => setPopular((data as SearchPromo[]) ?? []));
  }, [open, popular.length, supabase]);

  // Debounced filter-as-you-type; a token stops a slow response for an older
  // keystroke from overwriting a newer one.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      tokenRef.current++;
      setResults([]);
      setSettledQuery("");
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    const token = ++tokenRef.current;
    const id = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_for_you_promos", { p_query: q, p_limit: 20, p_offset: 0 });
      if (token !== tokenRef.current) return;
      if (error) {
        console.warn("search_for_you_promos failed", error.message);
        setFailed(true);
        setResults([]);
      } else {
        setFailed(false);
        setResults((data as SearchPromo[]) ?? []);
      }
      setSettledQuery(q);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query, open, supabase]);

  const remember = useCallback(async (q: string) => {
    const clean = q.trim();
    if (clean.length < 2) return;
    const prev = await readRecent();
    const next = [clean, ...prev.filter((r) => r.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
    writeRecent(next);
    setRecent(next);
  }, []);

  function pick(item: SearchPromo) {
    remember(query);
    onSelect(item);
  }

  const q = query.trim();
  const tokens = tokenize(settledQuery || q);
  const showResults = q.length > 0;

  const header = showResults ? (
    !loading && settledQuery === q && !failed && results.length > 0 ? (
      <Text className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-white/45">
        {results.length} {results.length === 1 ? "result" : "results"}
      </Text>
    ) : null
  ) : (
    <View>
      {recent.length > 0 ? (
        <View className="pt-3">
          <View className="flex-row items-center justify-between px-4 pb-1">
            <Text className="text-[12px] font-semibold uppercase tracking-wide text-white/45">{t("foryou.recent")}</Text>
            <Pressable
              onPress={() => {
                writeRecent([]);
                setRecent([]);
              }}
            >
              <Text className="text-[12px] font-semibold text-white/60">{t("foryou.clear")}</Text>
            </Pressable>
          </View>
          {recent.map((r) => (
            <Pressable key={r} onPress={() => setQuery(r)} className="flex-row items-center gap-3 px-4 py-2.5 active:bg-white/10">
              <Clock size={16} color="rgba(255,255,255,0.4)" />
              <Text numberOfLines={1} className="flex-1 text-[14px] text-white/85">
                {r}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {popular.length > 0 ? (
        <View className="pt-3">
          <Text className="px-4 pb-1 text-[12px] font-semibold uppercase tracking-wide text-white/45">{t("foryou.trendingNow")}</Text>
          {popular.map((item) => (
            <ResultRow key={item.episode_id} item={item} tokens={[]} onPick={pick} />
          ))}
        </View>
      ) : null}
    </View>
  );

  const empty =
    showResults && !results.length && !loading && settledQuery === q ? (
      <View className="px-8 pt-16">
        <Text className="text-center text-[15px] font-semibold text-white">
          {failed ? t("foryou.searchUnavailable") : t("foryou.noPromosMatch", { q })}
        </Text>
        <Text className="mt-1.5 text-center text-[13px] text-white/55">
          {failed ? t("foryou.checkConnection") : t("foryou.tryDifferent")}
        </Text>
      </View>
    ) : null;

  return (
    <Modal visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <View
          className="flex-row items-center gap-2 px-3 pb-3"
          style={{ paddingTop: insets.top + 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" }}
        >
          <Pressable onPress={onClose} accessibilityLabel={t("foryou.closeSearch")} hitSlop={8} className="h-9 w-9 items-center justify-center">
            <ArrowLeft size={22} color="#fff" />
          </Pressable>
          <View className="h-10 min-w-0 flex-1 flex-row items-center gap-2 rounded-full px-3.5" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
            <Search size={16} color="rgba(255,255,255,0.55)" />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => {
                remember(query);
                Keyboard.dismiss();
              }}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              placeholder={t("foryou.searchPlaceholder")}
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={{ flex: 1, color: "#fff", fontSize: 15, padding: 0 }}
            />
            {query ? (
              <Pressable
                onPress={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                accessibilityLabel={t("foryou.clear")}
                className="h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.25)" }}
              >
                <X size={12} color="#000" strokeWidth={3} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <FlatList
          data={showResults ? results : []}
          keyExtractor={(item) => item.episode_id}
          renderItem={({ item }) => <ResultRow item={item} tokens={tokens} onPick={pick} />}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => Keyboard.dismiss()}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </View>
    </Modal>
  );
}
