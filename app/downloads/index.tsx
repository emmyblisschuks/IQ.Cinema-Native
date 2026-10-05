// app/downloads/index.tsx
//
// In-app Downloads — reads from on-device storage only, so it works with no
// connection. `/downloads` lists movie folders; `/downloads?title=<id>` opens
// one folder (its episodes), like the web app.

import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, SquarePen } from "lucide-react-native";
import { createClient } from "@/lib/supabase/client";
import { useDownloads } from "@/hooks/useDownloads";
import { useI18n } from "@/hooks/useI18n";
import { useHideNav } from "@/hooks/useNavChrome";
import { removeDownloads, startDownload, type DownloadRow } from "@/lib/offline";
import { formatEpisodeCount } from "@/lib/format";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { FadeIn } from "@/components/ui/FadeIn";
import { EmptyState } from "@/components/library/EmptyState";
import { EditBar } from "@/components/library/EditBar";
import { FolderCard } from "@/components/downloads/FolderCard";
import { EpisodeRow } from "@/components/downloads/EpisodeRow";

const supabase = createClient();

export default function DownloadsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { title: titleId } = useLocalSearchParams<{ title?: string }>();
  const { folders, loading } = useDownloads();

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The edit bar takes the bottom nav's place while editing.
  useHideNav(editing);

  const folder = useMemo(() => (titleId ? folders.find((f) => f.titleId === titleId) ?? null : null), [folders, titleId]);

  // Leaving a view (or emptying it) always exits edit mode.
  useEffect(() => {
    setEditing(false);
    setSelected(new Set());
  }, [titleId]);

  // Deleting the last episode removes the folder; drop back to the list.
  useEffect(() => {
    if (titleId && !loading && !folder) router.replace("/downloads" as never);
  }, [titleId, loading, folder, router]);

  const items = folder ? folder.rows.map((r) => r.episode_id) : folders.map((f) => f.titleId);
  const total = items.length;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function removeSelected() {
    const ids = Array.from(selected);
    setConfirmOpen(false);
    if (!ids.length) return;
    // Folders select by title id → remove all of that title's episodes.
    const episodeIds = folder ? ids : folders.filter((f) => selected.has(f.titleId)).flatMap((f) => f.rows.map((r) => r.episode_id));
    await removeDownloads(episodeIds);
    setSelected(new Set());
    setEditing(false);
  }

  function play(r: DownloadRow) {
    router.push(`/downloads/play?id=${r.episode_id}` as never);
  }

  const confirmBody = folder ? t("downloads.confirmEpisodes") : t("downloads.confirmMovies");

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-2 pb-3">
              <Pressable
                onPress={() => (folder ? router.replace("/downloads" as never) : router.canGoBack() ? router.back() : router.replace("/profile" as never))}
                accessibilityLabel={t("downloads.backToDownloads")}
                hitSlop={8}
                className="-ml-1 h-9 w-9 items-center justify-center"
              >
                <Icon as={ArrowLeft} size={22} tone="text" />
              </Pressable>
              <Text numberOfLines={1} className="shrink text-[21px] font-semibold leading-tight text-text">
                {folder ? folder.title.trim() : t("downloads.title")}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                setEditing((v) => !v);
                setSelected(new Set());
              }}
              disabled={!total && !editing}
              accessibilityLabel={editing ? t("downloads.doneEditing") : t("downloads.edit")}
              className="-mt-0.5 h-9 min-w-9 items-center justify-center rounded-full px-1"
              style={{ opacity: !total && !editing ? 0.3 : 1 }}
            >
              {editing ? (
                <Text className="px-2 text-[15px] font-semibold text-pink">{t("downloads.done")}</Text>
              ) : (
                <Icon as={SquarePen} size={24} tone="text" strokeWidth={1.75} />
              )}
            </Pressable>
          </View>

          {!loading && total > 0 ? (
            <Text className="-mt-2 text-[13px] text-muted">
              {folder ? formatEpisodeCount(folder.rows.length, t) : t(folders.length === 1 ? "downloads.movie" : "downloads.movies", { n: folders.length })}
            </Text>
          ) : null}

          {loading ? (
            <View className="mt-5 flex-row gap-3">
              {[1, 2, 3].map((i) => (
                <View key={i} style={{ flex: 1 }}>
                  <Skeleton className="w-full rounded-lg" style={{ aspectRatio: 3 / 4 }} />
                  <Skeleton className="mt-2 h-3.5 w-4/5" />
                  <Skeleton className="mt-1.5 h-3 w-1/2" />
                </View>
              ))}
            </View>
          ) : null}

          {!loading && !folders.length && !titleId ? <EmptyState message={t("downloads.empty")} /> : null}

          {!loading && !folder && folders.length > 0 ? (
            <View className="mt-5 flex-row flex-wrap" style={{ columnGap: 12, rowGap: 20 }}>
              {folders.map((f) => (
                <View key={f.titleId} style={{ width: "31.2%" }}>
                  <FolderCard
                    folder={f}
                    editing={editing}
                    selected={selected.has(f.titleId)}
                    onPress={() => (editing ? toggleSelect(f.titleId) : router.push(`/downloads?title=${encodeURIComponent(f.titleId)}` as never))}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {folder ? (
            <View className="mt-5 gap-4">
              {folder.rows.map((r) => (
                <EpisodeRow
                  key={r.episode_id}
                  row={r}
                  poster={folder.poster}
                  editing={editing}
                  selected={selected.has(r.episode_id)}
                  onToggleSelect={() => toggleSelect(r.episode_id)}
                  onPlay={() => play(r)}
                  onRetry={() => void startDownload(supabase, r)}
                />
              ))}
            </View>
          ) : null}

          {!loading && total > 0 ? <Text className="mt-8 pb-2 text-center text-[15px] text-muted/70">{t("downloads.theEnd")}</Text> : null}
        </FadeIn>
      </ScrollView>

      {editing ? (
        <EditBar
          selectedCount={selected.size}
          total={total}
          actionLabel={t("downloads.delete")}
          onToggleAll={() => setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items)))}
          onAction={() => setConfirmOpen(true)}
        />
      ) : null}

      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("downloads.deleteTitle")}>
        <View className="px-5 pb-5">
          <Text className="text-[14px] leading-relaxed text-muted">
            {t(folder ? "downloads.selectedEpisodes" : "downloads.selectedMovies", { n: selected.size, body: confirmBody })}
          </Text>
          <View className="mt-5 flex-row gap-3">
            <Button variant="secondary" className="flex-1" onPress={() => setConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" className="flex-1" onPress={removeSelected}>
              {t("downloads.delete")}
            </Button>
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
