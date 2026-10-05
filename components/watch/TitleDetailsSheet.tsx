import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Eye } from "lucide-react-native";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet, markSheetNavigating } from "@/components/shared/BottomSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { formatCount } from "@/lib/format";
import { useI18n } from "@/hooks/useI18n";

export type SimilarTitle = {
  id: string;
  slug: string;
  title: string;
  poster_url: string | null;
};

export function TitleDetailsSheet({
  open,
  onClose,
  titleId,
  title,
  synopsis,
  views,
  contentRating,
  posterUrl,
  onSelectSimilar,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string | undefined;
  title: string;
  synopsis: string | null;
  views: number;
  contentRating?: string | null;
  posterUrl?: string | null;
  // Over the For You feed a similar-title tap stays in the feed (that title's
  // promo gets spliced in) instead of leaving for the title page.
  onSelectSimilar?: (t: SimilarTitle) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const supabase = createClient();
  const [tags, setTags] = useState<string[] | null>(null);
  const [similar, setSimilar] = useState<SimilarTitle[] | null>(null);

  const load = useCallback(async () => {
    if (!titleId) return;
    const [{ data: genreRows }, { data: similarRows }] = await Promise.all([
      supabase.from("title_genres").select("genres(name)").eq("title_id", titleId),
      supabase
        .from("titles")
        .select("id, slug, title, poster_url")
        .eq("status", "published")
        .neq("id", titleId)
        .order("total_unique_views", { ascending: false })
        .limit(8),
    ]);
    setTags(
      ((genreRows ?? []) as unknown as { genres: { name: string } | null }[])
        .map((r) => r.genres?.name)
        .filter((n): n is string => !!n)
    );
    setSimilar((similarRows as SimilarTitle[]) ?? []);
  }, [titleId, supabase]);

  // Re-fetch every time the sheet opens — tags/similar titles may have
  // changed since it was last shown.
  useEffect(() => {
    if (open) {
      setTags(null);
      setSimilar(null);
      load();
    }
  }, [open, load]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Details">
      <View className="gap-4 px-3 pb-3 pt-1">
        <View className="flex-row gap-3">
          {posterUrl ? (
            <View className="shrink-0 overflow-hidden rounded-md bg-surface-raised" style={{ width: 88, aspectRatio: 3 / 4 }}>
              <Image source={{ uri: posterUrl }} accessibilityLabel={title} style={{ width: 88, height: 117 }} contentFit="cover" />
            </View>
          ) : null}
          <View className="min-w-0 flex-1">
            <Text className="font-display text-[17px] font-semibold text-text">{title}</Text>
            <View className="mt-1 flex-row items-center gap-1.5">
              <Icon as={Eye} size={13} tone="muted" />
              <Text className="text-[12px] text-muted">{formatCount(views)} views</Text>
            </View>
            {contentRating ? (
              <View className="mt-2 self-start rounded border border-border px-1.5 py-0.5">
                <Text className="text-[11px] font-semibold text-muted">{contentRating}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {synopsis ? <Text className="text-[14px] leading-relaxed text-text/85">{synopsis}</Text> : null}

        {tags === null ? (
          <View className="flex-row gap-2">
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
          </View>
        ) : tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {tags.map((t) => (
              <View key={t} className="rounded-full bg-surface-raised px-3 py-1">
                <Text className="text-[12px] font-medium text-muted">{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View>
          <Text className="mb-2 text-[14px] font-semibold text-text">{t("watch.moreLikeThis")}</Text>
          {similar === null ? (
            <View className="flex-row gap-2.5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-[86px] shrink-0 rounded-md" />
              ))}
            </View>
          ) : similar.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5 pb-1">
              {similar.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    markSheetNavigating();
                    onClose();
                    if (onSelectSimilar) onSelectSimilar(t);
                    else router.replace(`/title/${t.slug}` as never);
                  }}
                  style={{ width: 86 }}
                  className="shrink-0"
                >
                  <View className="w-full overflow-hidden rounded-md bg-surface-raised" style={{ aspectRatio: 9 / 16 }}>
                    {t.poster_url ? (
                      <Image source={{ uri: t.poster_url }} accessibilityLabel={t.title} style={{ width: 86, height: 153 }} contentFit="cover" />
                    ) : null}
                  </View>
                  <Text numberOfLines={1} className="mt-1 text-[11px] font-medium text-text">
                    {t.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text className="py-2 text-[13px] text-muted">{t("watch.nothingSimilar")}</Text>
          )}
        </View>
      </View>
    </BottomSheet>
  );
}
