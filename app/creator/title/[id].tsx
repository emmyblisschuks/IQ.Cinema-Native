// app/creator/title/[id].tsx
//
// Manage one of your titles without leaving the app: edit details, submit for
// review / withdraw, pick the promo episode, and jump into any episode to edit,
// replace its video or delete it.

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Film, ImagePlus, Pencil, Plus } from "lucide-react-native";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, DEFAULT_CATEGORY, type Category } from "@/lib/categories";
import { CONTENT_RATINGS, type ContentRating } from "@/lib/contentRatings";
import { kindOf } from "@/lib/contentTypes";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { FadeIn } from "@/components/ui/FadeIn";

const supabase = createClient();

type TitleStatus = "draft" | "in_review" | "published" | "coming_soon" | "suspended" | "rejected" | "withdrawn";
type TitleRow = {
  id: string; title: string; slug: string; synopsis: string | null; genre: string | null; category: string | null;
  content_rating: ContentRating | null; poster_url: string | null; content_type: string; status: TitleStatus; credit_name: string | null;
  creator_id: string; admin_review_note: string | null; review_ignored_at: string | null; total_unique_views: number;
};
type EpisodeRow = { id: string; episode_number: number; name: string | null; status: "draft" | "processing" | "published" | "suspended"; video_url: string | null; is_promo: boolean };

const STATUS_TONE: Record<TitleStatus, { bg: string; fg: string }> = {
  draft: { bg: "rgba(128,128,128,0.18)", fg: "#8a8a93" },
  in_review: { bg: "rgba(234,179,8,0.18)", fg: "#b58900" },
  published: { bg: "rgba(34,197,94,0.18)", fg: "#16a34a" },
  coming_soon: { bg: "rgba(59,130,246,0.18)", fg: "#2563eb" },
  suspended: { bg: "rgba(239,68,68,0.18)", fg: "#dc2626" },
  rejected: { bg: "rgba(239,68,68,0.18)", fg: "#dc2626" },
  withdrawn: { bg: "rgba(128,128,128,0.18)", fg: "#8a8a93" },
};

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={clsx("rounded-full border px-3.5 py-2", active ? "border-pink bg-pink" : "border-border bg-surface")}>
      <Text className={clsx("text-[13px] font-medium", active ? "text-white" : "text-text")}>{label}</Text>
    </Pressable>
  );
}

export default function ManageTitleScreen() {
  const { t, genre: genreLabel } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { online } = useOnlineStatus();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState<TitleRow | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSynopsis, setEditSynopsis] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editCategory, setEditCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [editRating, setEditRating] = useState<ContentRating>("13+");
  const [editCredit, setEditCredit] = useState("");
  const [editPoster, setEditPoster] = useState<{ uri: string; mime: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: ti }, { data: eps }, { data: tagRows }] = await Promise.all([
      supabase
        .from("titles")
        .select("id, title, slug, synopsis, genre, category, content_rating, poster_url, content_type, status, credit_name, creator_id, admin_review_note, review_ignored_at, total_unique_views")
        .eq("id", id)
        .single(),
      supabase.from("episodes").select("id, episode_number, name, status, video_url, is_promo").eq("title_id", id).order("episode_number", { ascending: true }),
      supabase.from("title_genres").select("genres(name)").eq("title_id", id),
    ]);
    setTitle((ti as TitleRow) ?? null);
    setEpisodes((eps as EpisodeRow[]) ?? []);
    if (ti) {
      setEditTitle(ti.title);
      setEditSynopsis(ti.synopsis ?? "");
      setEditGenre(ti.genre ?? "");
      setEditTags(((tagRows ?? []) as unknown as { genres: { name: string } | null }[]).map((r) => r.genres?.name).filter((n): n is string => !!n));
      setEditCategory((ti.category as Category) ?? DEFAULT_CATEGORY);
      setEditRating((ti.content_rating as ContentRating) ?? "13+");
      setEditCredit(ti.credit_name ?? "");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
    supabase.from("genres").select("name").order("name").then(({ data }) => setGenres((data ?? []).map((g) => g.name as string)));
  }, [load]);

  async function pickPoster() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    setEditPoster({ uri: res.assets[0].uri, mime: res.assets[0].mimeType ?? "image/jpeg" });
  }

  async function saveDetails() {
    if (!title || !user) return;
    if (!online) return setError(t("upload.offline"));
    setBusy("save");
    setError(null);

    let posterUrl = title.poster_url;
    if (editPoster) {
      const path = `${user.id}/${uuid()}-poster.${editPoster.mime.includes("png") ? "png" : "jpg"}`;
      try {
        const bytes = await (await fetch(editPoster.uri)).arrayBuffer();
        const { error: upErr } = await supabase.storage.from("posters").upload(path, bytes, { contentType: editPoster.mime });
        if (upErr) throw upErr;
        posterUrl = supabase.storage.from("posters").getPublicUrl(path).data.publicUrl;
      } catch (e) {
        setError((e as Error).message ?? t("upload.err.uploadFailed"));
        setBusy(null);
        return;
      }
    }

    const { error: updErr } = await supabase
      .from("titles")
      .update({
        title: editTitle,
        synopsis: editSynopsis || null,
        genre: editGenre || null,
        category: editCategory,
        content_rating: editRating,
        poster_url: posterUrl,
        ...(kindOf(title.content_type).creditLabelKey ? { credit_name: editCredit.trim() || null } : {}),
      })
      .eq("id", title.id);
    if (updErr) {
      setBusy(null);
      setError(updErr.code === "23505" ? t("upload.err.titleExists") : updErr.message);
      return;
    }

    // Replace the extra-tag set: clear, then insert the current picks.
    const keep = editTags.filter((n) => n !== editGenre);
    const { error: clearErr } = await supabase.from("title_genres").delete().eq("title_id", title.id);
    if (!clearErr && keep.length) {
      const { data: gRows } = await supabase.from("genres").select("id, name").in("name", keep);
      if (gRows?.length) {
        const { error: tagErr } = await supabase.from("title_genres").insert(gRows.map((g) => ({ title_id: title.id, genre_id: g.id })));
        if (tagErr) setError(tagErr.message);
      }
    }
    setBusy(null);
    setEditing(false);
    setEditPoster(null);
    void load();
  }

  async function rpc(kind: "submit" | "withdraw" | `promo-${string}`) {
    if (!online) return setError(t("upload.offline"));
    setBusy(kind);
    setError(null);
    const isPart = title?.content_type === "one_part_film";
    let res;
    if (kind === "submit") res = await supabase.rpc("submit_title_for_review", { p_title_id: id });
    else if (kind === "withdraw") res = await supabase.rpc("withdraw_title", { p_title_id: id });
    else res = await supabase.rpc("set_promo_episode", { p_title_id: id, p_episode_id: kind.slice(6) });
    setBusy(null);
    const { data, error: rpcErr } = res;
    if (rpcErr || !data?.ok) {
      const fallback = kind === "submit" ? t("manage.err.submit") : kind === "withdraw" ? t("manage.err.withdraw") : t("manage.err.promo");
      setError(
        data?.error === "no_video"
          ? t(isPart ? "manage.err.noVideo.part" : "manage.err.noVideo.episode")
          : rpcErr?.message || data?.error || fallback
      );
      return;
    }
    void load();
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace("/creator/dashboard" as never));

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.muted} />
      </SafeAreaView>
    );
  }
  if (!title || (user && title.creator_id !== user.id)) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-center text-[14px] text-muted">{t("manage.notFound")}</Text>
        <Button variant="secondary" className="mt-4" onPress={back}>{t("common.back")}</Button>
      </SafeAreaView>
    );
  }

  const isPart = !kindOf(title.content_type).multi;
  const unit = isPart ? "part" : "episode";
  const unitN = (n: number) => t(isPart ? "upload.partN" : "common.episodeN", { n });
  const numbered = episodes.filter((e) => e.episode_number > 0);
  const promoClip = episodes.find((e) => e.episode_number === 0) ?? null;
  const hasFinalized = episodes.some((e) => e.status === "processing" || e.status === "published");
  const tone = STATUS_TONE[title.status];
  const canSubmit = ["draft", "rejected", "withdrawn"].includes(title.status);
  const canWithdraw = ["in_review", "published"].includes(title.status);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <FadeIn>
            <View className="flex-row items-center gap-3">
              <Pressable onPress={back} hitSlop={10} accessibilityLabel={t("common.back")}>
                <Icon as={ArrowLeft} size={20} tone="text" />
              </Pressable>
              <Text numberOfLines={1} className="min-w-0 flex-1 font-display text-2xl font-semibold text-text">{title.title}</Text>
            </View>

            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: tone.bg }}>
                <Text className="text-[11px] font-semibold" style={{ color: tone.fg }}>{t(`creator.status.${title.status}`)}</Text>
              </View>
              {title.content_rating ? (
                <View className="rounded border border-border px-1.5 py-0.5"><Text className="text-[11px] font-semibold text-muted">{title.content_rating}</Text></View>
              ) : null}
              {title.genre ? <Text className="text-[12px] text-muted">{title.genre}</Text> : null}
            </View>

            {title.status === "rejected" && title.admin_review_note ? (
              <View className="mt-3 rounded-md bg-crimson-soft px-4 py-3">
                <Text className="text-[13px] font-semibold text-crimson">{t("manage.declined")}</Text>
                <Text className="mt-0.5 text-[13px] text-crimson">{title.admin_review_note}</Text>
              </View>
            ) : null}
            {title.review_ignored_at && title.status === "in_review" ? (
              <View className="mt-3 rounded-md bg-surface-raised px-4 py-3"><Text className="text-[13px] text-text">{t("manage.stillInReview")}</Text></View>
            ) : null}
            {error ? <Text className="mt-3 text-[13px] text-crimson">{error}</Text> : null}

            <View className="mt-4 flex-row flex-wrap gap-2">
              {canSubmit ? (
                <Button size="sm" disabled={busy !== null || !hasFinalized} onPress={() => rpc("submit")}>
                  {busy === "submit" ? t("creator.submitting") : t("manage.submitForReview")}
                </Button>
              ) : null}
              {canWithdraw ? (
                <Button size="sm" variant="secondary" disabled={busy !== null} onPress={() => rpc("withdraw")}>
                  {busy === "withdraw" ? t("manage.withdrawing") : t("manage.withdraw")}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onPress={() => setEditing((v) => !v)}>
                <Icon as={Pencil} size={13} tone="text" />
                {editing ? t("manage.cancelEdit") : t("manage.editDetails")}
              </Button>
            </View>
            {canSubmit && !hasFinalized ? (
              <Text className="mt-2 text-[12px] text-muted">{t(isPart ? "manage.finalizeFirst.part" : "manage.finalizeFirst.episode")}</Text>
            ) : null}

            {editing ? (
              <View className="mt-4 gap-3 rounded-md border border-border bg-surface p-4">
                <Input value={editTitle} onChangeText={setEditTitle} placeholder={t("upload.titlePlaceholder")} />
                {kindOf(title.content_type).creditLabelKey ? (
                  <Input value={editCredit} onChangeText={setEditCredit} placeholder={t(title.content_type === "music_video" ? "wiz.credit.placeholderArtist" : "wiz.credit.placeholderBrand")} />
                ) : null}
                <Input value={editSynopsis} onChangeText={setEditSynopsis} placeholder={t("upload.synopsis")} multiline style={{ height: 96, paddingTop: 12, textAlignVertical: "top" }} />

                <View>
                  <Text className="mb-2 text-[13px] font-semibold text-muted">{t("foryou.collection")}</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {CATEGORIES.map((c) => <Chip key={c.value} label={t(c.labelKey)} active={editCategory === c.value} onPress={() => setEditCategory(c.value)} />)}
                  </View>
                </View>

                {genres.length > 0 ? (
                  <View>
                    <Text className="mb-2 text-[13px] font-semibold text-muted">{t("upload.genre")}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      <Chip label={t("manage.noGenre")} active={!editGenre} onPress={() => setEditGenre("")} />
                      {genres.map((g) => <Chip key={g} label={genreLabel(g)} active={editGenre === g} onPress={() => setEditGenre(g)} />)}
                    </View>
                  </View>
                ) : null}

                {genres.length > 0 ? (
                  <View>
                    <Text className="mb-2 text-[13px] font-semibold text-muted">{t("manage.tags")}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {genres.filter((g) => g !== editGenre).map((g) => (
                        <Chip key={g} label={genreLabel(g)} active={editTags.includes(g)} onPress={() => setEditTags((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))} />
                      ))}
                    </View>
                  </View>
                ) : null}

                <View>
                  <Text className="mb-2 text-[13px] font-semibold text-muted">{t("upload.rating")}</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {CONTENT_RATINGS.map((r) => <Chip key={r.value} label={t(`rating.${r.value}`)} active={editRating === r.value} onPress={() => setEditRating(r.value)} />)}
                  </View>
                </View>

                <Pressable onPress={pickPoster} className="flex-row items-center gap-3 rounded-lg border border-dashed border-border p-3">
                  <View className="h-16 w-12 items-center justify-center overflow-hidden rounded-md bg-surface-raised">
                    {editPoster || title.poster_url ? <Image source={{ uri: editPoster?.uri ?? title.poster_url! }} style={{ width: 48, height: 64 }} contentFit="cover" /> : <Icon as={ImagePlus} size={20} tone="muted" />}
                  </View>
                  <Text className="flex-1 text-[13.5px] text-text">{t("manage.replacePoster")}</Text>
                </Pressable>

                <Button disabled={busy !== null || !editTitle.trim()} onPress={saveDetails}>
                  {busy === "save" ? t("upload.saving") : t("manage.saveChanges")}
                </Button>
              </View>
            ) : null}

            {/* Episodes */}
            <View className="mt-7">
              <View className="flex-row items-center justify-between">
                <Text className="font-display text-[16px] font-semibold text-text">{t(`manage.unitHeading.${unit}`)}</Text>
                <Pressable onPress={() => router.push(`/creator/upload?titleId=${title.id}` as never)} className="flex-row items-center gap-1.5" hitSlop={8}>
                  <Icon as={Plus} size={15} tone="pink" />
                  <Text className="text-[13px] font-semibold text-pink">{t(`upload.addUnit.${unit}`)}</Text>
                </Pressable>
              </View>

              {numbered.length === 0 ? (
                <Text className="mt-3 text-[13px] text-muted">{t(`manage.noUnits.${unit}`)}</Text>
              ) : (
                <View className="mt-3 gap-2">
                  {numbered.map((e) => (
                    <Pressable
                      key={e.id}
                      onPress={() => router.push(`/creator/upload?titleId=${title.id}&episodeId=${e.id}` as never)}
                      className="flex-row items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
                    >
                      <Icon as={Film} size={16} tone="muted" />
                      <Text numberOfLines={1} className="flex-1 text-[13.5px] text-text">
                        {unitN(e.episode_number)}
                        {e.name ? ` · ${e.name}` : ""}
                        {e.is_promo ? t("manage.currentlyPromo") : ""}
                      </Text>
                      <Text className="text-[12px] text-muted">{t(`upload.status.${e.status}`)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Promo */}
            <View className="mt-7">
              <Text className="font-display text-[16px] font-semibold text-text">{t("manage.promoEpisode")}</Text>
              <Text className="mt-1 text-[12.5px] leading-relaxed text-muted">{t(`manage.promoHint.${unit}`)}</Text>

              {promoClip ? (
                <View className="mt-3 rounded-lg border border-border bg-surface px-3 py-2.5">
                  <Text className="text-[13.5px] text-text">{t("manage.dedicatedPromoClip")}</Text>
                  <Text className="mt-0.5 text-[12px] text-muted">{t(`upload.status.${promoClip.status}`)}{promoClip.is_promo ? t("manage.currentlyPromo") : ""}</Text>
                </View>
              ) : null}

              {numbered.length === 0 && !promoClip ? (
                <Text className="mt-3 text-[13px] text-muted">{t(`manage.noUnitsPromo.${unit}`)}</Text>
              ) : (
                <View className="mt-3 gap-2">
                  {numbered.map((e) => (
                    <View key={e.id} className="flex-row items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
                      <Text className="text-[13.5px] text-text">{unitN(e.episode_number)}</Text>
                      {e.is_promo ? (
                        <Text className="text-[12px] font-semibold text-pink">{t("manage.promo")}</Text>
                      ) : e.status !== "published" ? (
                        <Text className="text-[12px] text-muted">{t("manage.publishFirst")}</Text>
                      ) : (
                        <Pressable onPress={() => rpc(`promo-${e.id}`)} disabled={busy !== null} hitSlop={8}>
                          <Text className="text-[13px] font-semibold text-pink">{busy === `promo-${e.id}` ? t("manage.settingPromo") : t("manage.setAsPromo")}</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
              )}

              <Pressable onPress={() => router.push(`/creator/upload?titleId=${title.id}&promo=1` as never)} className="mt-3" hitSlop={8}>
                <Text className="text-[13px] font-semibold text-pink">{t("manage.uploadPromoInstead")}</Text>
              </Pressable>
            </View>
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
