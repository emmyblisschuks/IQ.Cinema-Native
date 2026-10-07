// app/creator/upload.tsx
//
// The upload wizard: Type → Details → Poster → Video → Review.
// Every step saves to the database as a draft the moment you continue, so
// nothing is lost if you leave — your drafts are listed on the first screen
// and open at the first unfinished step.
//   /creator/upload                      → start new / continue a draft
//   /creator/upload?titleId=…            → open a title (drafts at the right step;
//                                           live titles open on "add a video")
//   …&episodeId=… / …&promo=1            → jump to one episode / the promo clip

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, CheckCircle2, Film, ImagePlus, Plus, Trash2 } from "lucide-react-native";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { STORYBOARD_BUCKET, storyboardPath } from "@/lib/storyboard";
import { STORY_CATEGORIES, DEFAULT_CATEGORY, type Category } from "@/lib/categories";
import { CONTENT_RATINGS, type ContentRating } from "@/lib/contentRatings";
import { CONTENT_KINDS, kindOf, type ContentKind } from "@/lib/contentTypes";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTheme } from "@/hooks/useTheme";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { UploadSlot, type UploadedVideo } from "@/components/creator/UploadSlot";
import { Button } from "@/components/ui/Button";
import { FadeIn } from "@/components/ui/FadeIn";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";

const supabase = createClient();

const EDITABLE = ["draft", "rejected", "withdrawn"];
const STEP_KEYS = ["wiz.step.type", "wiz.step.details", "wiz.step.poster", "wiz.step.video", "wiz.step.review"] as const;
const [S_TYPE, S_DETAILS, S_POSTER, S_VIDEO, S_REVIEW] = [0, 1, 2, 3, 4];

type TitleRow = {
  id: string; title: string; synopsis: string | null; genre: string | null; category: string | null;
  content_rating: ContentRating | null; content_type: string; poster_url: string | null; credit_name: string | null; status: string;
};
type EpisodeRow = { id: string; episode_number: number; name: string | null; status: string; video_url: string | null; is_promo: boolean };
type DraftCard = TitleRow & { videos: number };

const TITLE_COLS = "id, title, synopsis, genre, category, content_rating, content_type, poster_url, credit_name, status";
const EP_COLS = "id, episode_number, name, status, video_url, is_promo";

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
const slugify = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function Chip({ label, active, onPress, disabled }: { label: string; active: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} className={clsx("rounded-full border px-3.5 py-2", active ? "border-pink bg-pink" : "border-border bg-surface")} style={{ opacity: disabled && !active ? 0.5 : 1 }}>
      <Text className={clsx("text-[13px] font-medium", active ? "text-white" : "text-text")}>{label}</Text>
    </Pressable>
  );
}

function Banner({ message, tone = "error" }: { message: string | null; tone?: "error" | "info" }) {
  if (!message) return null;
  return (
    <View className={clsx("rounded-md px-3 py-2.5", tone === "error" ? "bg-crimson-soft" : "bg-surface-raised")}>
      <Text className={clsx("text-[13px]", tone === "error" ? "text-crimson" : "text-text")}>{message}</Text>
    </View>
  );
}

export default function UploadWizard() {
  const { t, genre: genreLabel } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { online } = useOnlineStatus();
  const { titleId: titleIdParam, episodeId: episodeIdParam, promo: promoParam } = useLocalSearchParams<{ titleId?: string; episodeId?: string; promo?: string }>();

  const [view, setView] = useState<"loading" | "landing" | "wizard" | "done">(titleIdParam ? "loading" : "landing");
  const [step, setStep] = useState(S_TYPE);

  // landing
  const [drafts, setDrafts] = useState<DraftCard[] | null>(null);
  const [others, setOthers] = useState<TitleRow[]>([]);
  const [deleteDraft, setDeleteDraft] = useState<DraftCard | null>(null);
  const [deleting, setDeleting] = useState(false);

  // the title being built
  const [title, setTitle] = useState<TitleRow | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [genres, setGenres] = useState<string[]>([]);

  // details form
  const [kindValue, setKindValue] = useState<string>("full_episode");
  const [name, setName] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [credit, setCredit] = useState("");
  const [genre, setGenre] = useState("");
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [rating, setRating] = useState<ContentRating>("13+");

  // poster
  const [posterBusy, setPosterBusy] = useState(false);
  const [skippedPoster, setSkippedPoster] = useState(false);

  // video step
  const [slotBusy, setSlotBusy] = useState(false);
  const [newNumber, setNewNumber] = useState("1");
  const [newName, setNewName] = useState("");
  const [newSlotKey, setNewSlotKey] = useState(0); // remount the "new" slot after each save
  const [promoMode, setPromoMode] = useState(promoParam === "1");
  const [confirmDeleteEp, setConfirmDeleteEp] = useState<EpisodeRow | null>(null);
  const [deletingEp, setDeletingEp] = useState(false);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kind: ContentKind = useMemo(() => kindOf(title?.content_type ?? kindValue), [title, kindValue]);
  const addMode = !!title && !EDITABLE.includes(title.status); // live title: just add a video
  const videos = episodes.filter((e) => e.video_url);

  // ── data ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from("genres").select("name").order("name").then(({ data }) => setGenres((data ?? []).map((g) => g.name as string)));
  }, []);

  const loadLanding = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("titles").select(TITLE_COLS).eq("creator_id", user.id).order("updated_at", { ascending: false });
    const rows = (data as TitleRow[]) ?? [];
    const editable = rows.filter((r) => EDITABLE.includes(r.status));
    const ids = editable.map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: eps } = await supabase.from("episodes").select("title_id, video_url").in("title_id", ids);
      for (const e of eps ?? []) if (e.video_url) counts.set(e.title_id, (counts.get(e.title_id) ?? 0) + 1);
    }
    setDrafts(editable.map((r) => ({ ...r, videos: counts.get(r.id) ?? 0 })));
    setOthers(rows.filter((r) => !EDITABLE.includes(r.status)));
  }, [user]);

  useEffect(() => {
    if (user && view === "landing") void loadLanding();
  }, [user, view, loadLanding]);

  const applyTitle = useCallback((ti: TitleRow) => {
    setTitle(ti);
    setKindValue(ti.content_type);
    setName(ti.title);
    setSynopsis(ti.synopsis ?? "");
    setCredit(ti.credit_name ?? "");
    setGenre(ti.genre ?? "");
    setCategory(((ti.category as Category) ?? DEFAULT_CATEGORY));
    setRating((ti.content_rating as ContentRating) ?? "13+");
  }, []);

  const stepFor = (ti: TitleRow, eps: EpisodeRow[], skipped: boolean) =>
    !EDITABLE.includes(ti.status) ? S_VIDEO : !ti.poster_url && !skipped ? S_POSTER : !eps.some((e) => e.video_url) ? S_VIDEO : S_REVIEW;

  const openTitle = useCallback(
    async (id: string) => {
      setView("loading");
      setError(null);
      const [{ data: ti }, { data: eps }, skipped] = await Promise.all([
        supabase.from("titles").select(TITLE_COLS).eq("id", id).single(),
        supabase.from("episodes").select(EP_COLS).eq("title_id", id).order("episode_number", { ascending: true }),
        AsyncStorage.getItem(`wizard:skipPoster:${id}`),
      ]);
      if (!ti) {
        setView("landing");
        return;
      }
      const list = (eps as EpisodeRow[]) ?? [];
      applyTitle(ti as TitleRow);
      setEpisodes(list);
      setSkippedPoster(skipped === "1");
      setNewNumber(String(list.reduce((m, e) => Math.max(m, e.episode_number), 0) + 1));
      setStep(promoParam === "1" || episodeIdParam ? S_VIDEO : stepFor(ti as TitleRow, list, skipped === "1"));
      setView("wizard");
    },
    [applyTitle, promoParam, episodeIdParam]
  );

  useEffect(() => {
    if (titleIdParam && user) void openTitle(titleIdParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleIdParam, user]);

  // restore an unfinished "new" form
  async function startNew() {
    setTitle(null);
    setEpisodes([]);
    setError(null);
    const raw = await AsyncStorage.getItem("wizard:new:v1");
    if (raw) {
      try {
        const f = JSON.parse(raw);
        setKindValue(f.kind ?? "full_episode"); setName(f.name ?? ""); setSynopsis(f.synopsis ?? ""); setCredit(f.credit ?? "");
        setGenre(f.genre ?? ""); setCategory(f.category ?? DEFAULT_CATEGORY); setRating(f.rating ?? "13+");
      } catch { /* ignore */ }
    }
    setStep(S_TYPE);
    setView("wizard");
  }
  useEffect(() => {
    if (view === "wizard" && !title) {
      AsyncStorage.setItem("wizard:new:v1", JSON.stringify({ kind: kindValue, name, synopsis, credit, genre, category, rating })).catch(() => {});
    }
  }, [view, title, kindValue, name, synopsis, credit, genre, category, rating]);

  // ── step actions ────────────────────────────────────────────────────
  async function saveDetails() {
    if (!user) return;
    if (!name.trim()) return setError(t("wiz.err.titleRequired"));
    if (!online) return setError(t("upload.offline"));
    setSaving(true);
    setError(null);
    const fields = {
      title: name.trim(),
      synopsis: synopsis.trim() || null,
      genre: genre || null,
      category: kind.fixedCategory ?? category,
      content_rating: rating,
      credit_name: kind.creditLabelKey ? credit.trim() || null : null,
    };
    const res = title
      ? await supabase.from("titles").update(fields).eq("id", title.id).select(TITLE_COLS).single()
      : await supabase
          .from("titles")
          .insert({ ...fields, creator_id: user.id, slug: slugify(name) || uuid().slice(0, 8), content_type: kindValue, status: "draft" })
          .select(TITLE_COLS)
          .single();
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error?.code === "23505" ? t("upload.err.titleExists") : res.error?.message ?? t("upload.err.createTitle"));
      return;
    }
    applyTitle(res.data as TitleRow);
    if (!title) AsyncStorage.removeItem("wizard:new:v1").catch(() => {});
    setStep(S_POSTER);
  }

  async function pickPoster() {
    if (!user || !title) return;
    if (!online) return setError(t("upload.offline"));
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    if ((a.fileSize ?? 0) > 5 * 1024 * 1024) return setError(t("wiz.poster.errSize"));
    setPosterBusy(true);
    setError(null);
    try {
      const mime = a.mimeType ?? "image/jpeg";
      const path = `${user.id}/${uuid()}-poster.${mime.includes("png") ? "png" : "jpg"}`;
      const bytes = await (await fetch(a.uri)).arrayBuffer();
      const { error: upErr } = await supabase.storage.from("posters").upload(path, bytes, { contentType: mime });
      if (upErr) throw upErr;
      const url = supabase.storage.from("posters").getPublicUrl(path).data.publicUrl;
      const { error: updErr } = await supabase.from("titles").update({ poster_url: url }).eq("id", title.id);
      if (updErr) throw updErr;
      setTitle({ ...title, poster_url: url });
    } catch (e) {
      setError(t("wiz.poster.errUpload", { msg: (e as Error).message ?? "" }));
    } finally {
      setPosterBusy(false);
    }
  }

  async function skipPoster() {
    if (title) await AsyncStorage.setItem(`wizard:skipPoster:${title.id}`, "1");
    setSkippedPoster(true);
    setStep(S_VIDEO);
  }

  // Saves the episode row once its video is fully uploaded.
  async function saveEpisode(row: EpisodeRow | null, v: UploadedVideo, opts: { number: number; name: string | null; promo: boolean }) {
    if (!title) throw new Error("No title");
    const payload = {
      title_id: title.id,
      episode_number: opts.promo ? 0 : opts.number,
      name: opts.name,
      video_url: v.path,
      duration_seconds: v.durationSeconds,
      video_width: v.width,
      video_height: v.height,
      // live titles go straight into processing; drafts stay drafts until submit
      status: addMode ? "processing" : "draft",
    };
    const q = row
      ? supabase.from("episodes").update(payload).eq("id", row.id)
      : supabase.from("episodes").insert(payload);
    const { data, error: err } = await q.select(EP_COLS).single();
    if (err || !data) throw new Error(err?.message ?? "Couldn't save the episode");
    const saved = data as EpisodeRow;

    // A replaced video leaves the old file behind: remove it (best-effort).
    if (row?.video_url && row.video_url !== v.path) {
      supabase.storage.from("videos").remove([row.video_url]).then(() => {}, () => {});
      supabase.storage.from(STORYBOARD_BUCKET).remove([storyboardPath(row.video_url)]).then(() => {}, () => {});
    }
    if (opts.promo) {
      const { data: r } = await supabase.rpc("set_promo_episode", { p_title_id: title.id, p_episode_id: saved.id });
      if (!r?.ok) throw new Error(r?.error ?? t("upload.err.promoFailed"));
    }
    setEpisodes((prev) => [...prev.filter((e) => e.id !== saved.id), saved].sort((a, b) => a.episode_number - b.episode_number));
    if (!row) {
      setNewNumber(String(saved.episode_number + 1));
      setNewName("");
      setNewSlotKey((k) => k + 1);
      setPromoMode(false);
    }
  }

  async function removeEpisode(ep: EpisodeRow) {
    setDeletingEp(true);
    const { error: err } = await supabase.from("episodes").delete().eq("id", ep.id);
    setDeletingEp(false);
    if (err) return setError(err.message);
    if (ep.video_url) {
      supabase.storage.from("videos").remove([ep.video_url]).then(() => {}, () => {});
      supabase.storage.from(STORYBOARD_BUCKET).remove([storyboardPath(ep.video_url)]).then(() => {}, () => {});
    }
    setEpisodes((prev) => prev.filter((e) => e.id !== ep.id));
    setConfirmDeleteEp(null);
  }

  async function submitForReview() {
    if (!title) return;
    if (!online) return setError(t("upload.offline"));
    setSubmitting(true);
    setError(null);
    // Finalize every uploaded draft episode so it enters processing, then submit.
    const pending = episodes.filter((e) => e.status === "draft" && e.video_url);
    for (const e of pending) {
      const { error: err } = await supabase.from("episodes").update({ status: "processing" }).eq("id", e.id);
      if (err) {
        setSubmitting(false);
        return setError(t("wiz.err.submit", { msg: err.message }));
      }
    }
    const { data, error: rpcErr } = await supabase.rpc("submit_title_for_review", { p_title_id: title.id });
    setSubmitting(false);
    if (rpcErr || !data?.ok) {
      const msg = data?.error === "no_video" ? t(kind.multi ? "manage.err.noVideo.episode" : "manage.err.noVideo.part") : rpcErr?.message || data?.error || t("manage.err.submit");
      return setError(t("wiz.err.submit", { msg }));
    }
    setView("done");
  }

  async function confirmDeleteDraft() {
    if (!deleteDraft) return;
    setDeleting(true);
    const { data: eps } = await supabase.from("episodes").select("video_url").eq("title_id", deleteDraft.id);
    const paths = (eps ?? []).map((e) => e.video_url as string | null).filter((p): p is string => !!p);
    if (paths.length) {
      await supabase.storage.from("videos").remove(paths).catch(() => {});
      await supabase.storage.from(STORYBOARD_BUCKET).remove(paths.map(storyboardPath)).catch(() => {});
    }
    await supabase.from("episodes").delete().eq("title_id", deleteDraft.id);
    await supabase.from("titles").delete().eq("id", deleteDraft.id);
    setDeleting(false);
    setDeleteDraft(null);
    void loadLanding();
  }

  // ── navigation ──────────────────────────────────────────────────────
  const minStep = title ? S_DETAILS : S_TYPE;
  function goBack() {
    setError(null);
    if (view === "wizard" && !addMode && step > minStep) return setStep(step - 1);
    if (titleIdParam) return router.canGoBack() ? router.back() : router.replace("/creator/dashboard" as never);
    setTitle(null);
    setView("landing");
  }

  // ── render ──────────────────────────────────────────────────────────
  if (authLoading || view === "loading") {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={colors.muted} />
      </SafeAreaView>
    );
  }
  if (!user) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-bg px-8">
        <Text className="text-center text-[15px] text-muted">{t("profile.guestBody")}</Text>
        <Button onPress={() => router.push("/auth/login" as never)}>{t("profile.signIn")}</Button>
      </SafeAreaView>
    );
  }

  const header = (label: string, withSteps: boolean) => (
    <View>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={view === "landing" ? () => (router.canGoBack() ? router.back() : router.replace("/creator/dashboard" as never)) : goBack}
          disabled={slotBusy}
          hitSlop={10}
          accessibilityLabel={t("wiz.back")}
          style={{ opacity: slotBusy ? 0.4 : 1 }}
        >
          <Icon as={ArrowLeft} size={20} tone="text" />
        </Pressable>
        <Text numberOfLines={1} className="flex-1 font-display text-2xl font-semibold text-text">{label}</Text>
      </View>
      {withSteps ? (
        <View className="mt-4">
          <View className="flex-row gap-1.5">
            {STEP_KEYS.map((k, i) => (
              <View key={k} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: i <= step ? colors.pink : colors["surface-raised"] }} />
            ))}
          </View>
          <Text className="mt-2 text-[12.5px] text-muted">
            {t("wiz.landing.stepOf", { n: step + 1, total: STEP_KEYS.length, step: t(STEP_KEYS[step]) })}
          </Text>
        </View>
      ) : null}
    </View>
  );

  // ─── done ───
  if (view === "done") {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 items-center justify-center gap-4 bg-bg px-8">
        <CheckCircle2 size={56} color={colors.pink} />
        <Text className="text-center font-display text-2xl font-semibold text-text">{t("wiz.review.doneTitle")}</Text>
        <Text className="text-center text-[14px] text-muted">{t("wiz.review.doneBody")}</Text>
        <View className="mt-2 w-full gap-3">
          <Button onPress={() => router.replace("/creator/dashboard" as never)}>{t("creator.backToDashboard")}</Button>
          <Button variant="secondary" onPress={() => { setTitle(null); setEpisodes([]); setName(""); setSynopsis(""); setCredit(""); setGenre(""); setView("landing"); }}>
            {t("wiz.review.another")}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // ─── landing ───
  if (view === "landing") {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          <FadeIn>
            {header(t("upload.title"), false)}
            <Pressable onPress={startNew} className="mt-5 rounded-lg border border-pink bg-crimson-soft p-4">
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-pink"><Icon as={Plus} size={22} tone="white" /></View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[15.5px] font-semibold text-text">{t("wiz.landing.start")}</Text>
                  <Text className="mt-0.5 text-[12.5px] leading-snug text-muted">{t("wiz.landing.startHint")}</Text>
                </View>
              </View>
            </Pressable>

            <Text className="mb-2 mt-7 text-[14px] font-semibold text-text">{t("wiz.landing.drafts")}</Text>
            {drafts === null ? (
              <ActivityIndicator color={colors.muted} />
            ) : drafts.length === 0 ? (
              <Text className="text-[13px] text-muted">{t("wiz.landing.noDrafts")}</Text>
            ) : (
              <View className="gap-2.5">
                {drafts.map((d) => {
                  const s = stepFor(d, Array.from({ length: d.videos }, () => ({ video_url: "x" }) as EpisodeRow), false);
                  return (
                    <View key={d.id} className="flex-row items-center gap-3 rounded-lg border border-border bg-surface p-3">
                      <Pressable onPress={() => openTitle(d.id)} className="min-w-0 flex-1 flex-row items-center gap-3">
                        <View className="h-16 w-12 overflow-hidden rounded-md bg-surface-raised">
                          {d.poster_url ? <Image source={{ uri: d.poster_url }} style={{ width: 48, height: 64 }} contentFit="cover" /> : <View className="flex-1 items-center justify-center"><Text className="text-[20px]">{kindOf(d.content_type).emoji}</Text></View>}
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={1} className="text-[14.5px] font-semibold text-text">{d.title}</Text>
                          <Text numberOfLines={1} className="mt-0.5 text-[12px] text-muted">{t(kindOf(d.content_type).nameKey)}</Text>
                          <Text className="mt-0.5 text-[12px] text-pink">{t("wiz.landing.stepOf", { n: s + 1, total: STEP_KEYS.length, step: t(STEP_KEYS[s]) })}</Text>
                        </View>
                      </Pressable>
                      <Pressable onPress={() => setDeleteDraft(d)} hitSlop={10} accessibilityLabel={t("wiz.landing.deleteDraft")}>
                        <Icon as={Trash2} size={18} tone="muted" />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

            {others.length > 0 ? (
              <View className="mt-7">
                <Text className="mb-2 text-[14px] font-semibold text-text">{t("wiz.landing.others")}</Text>
                <View className="gap-2">
                  {others.map((o) => (
                    <View key={o.id} className="flex-row items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
                      <Pressable onPress={() => router.push(`/creator/title/${o.id}` as never)} className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-[13.5px] font-medium text-text">{o.title}</Text>
                        <Text className="text-[11.5px] text-muted">{t(`creator.status.${o.status}`)}</Text>
                      </Pressable>
                      <Pressable onPress={() => openTitle(o.id)} hitSlop={8}>
                        <Text className="text-[12.5px] font-semibold text-pink">{t("wiz.landing.addTo")}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </FadeIn>
        </ScrollView>

        <BottomSheet open={!!deleteDraft} onClose={() => setDeleteDraft(null)} title={t("wiz.landing.deleteDraft")}>
          <View className="px-5 pb-5">
            <Text className="text-[14px] leading-relaxed text-muted">{t("wiz.landing.deleteBody")}</Text>
            <View className="mt-5 flex-row gap-3">
              <Button variant="secondary" className="flex-1" onPress={() => setDeleteDraft(null)}>{t("common.cancel")}</Button>
              <Button variant="danger" className="flex-1" disabled={deleting} onPress={confirmDeleteDraft}>{deleting ? t("upload.deleting") : t("downloads.delete")}</Button>
            </View>
          </View>
        </BottomSheet>
      </SafeAreaView>
    );
  }

  // ─── wizard ───
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 56 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <FadeIn>
            {header(addMode ? title!.title : t("upload.title"), !addMode)}

            {/* ── 1 · type ── */}
            {step === S_TYPE && !title ? (
              <View className="mt-6 gap-3">
                <Text className="font-display text-[19px] font-semibold text-text">{t("wiz.type.heading")}</Text>
                <Text className="-mt-1 text-[12.5px] text-muted">{t("wiz.type.hint")}</Text>
                {CONTENT_KINDS.map((k) => (
                  <Pressable key={k.value} onPress={() => setKindValue(k.value)} className={clsx("flex-row items-center gap-3.5 rounded-lg border p-3.5", kindValue === k.value ? "border-pink bg-crimson-soft" : "border-border bg-surface")}>
                    <Text className="text-[26px]">{k.emoji}</Text>
                    <View className="min-w-0 flex-1">
                      <Text className="text-[15px] font-semibold text-text">{t(k.nameKey)}</Text>
                      <Text className="mt-0.5 text-[12.5px] text-muted">{t(k.descKey)}</Text>
                      <Text className="mt-0.5 text-[11.5px] text-muted">{t("wiz.kind.limits", { max: k.maxLabel })}</Text>
                    </View>
                    <View className={clsx("h-5 w-5 items-center justify-center rounded-full border-2", kindValue === k.value ? "border-pink bg-pink" : "border-border")}>
                      {kindValue === k.value ? <View className="h-2 w-2 rounded-full bg-white" /> : null}
                    </View>
                  </Pressable>
                ))}
                <Button onPress={() => setStep(S_DETAILS)} className="mt-2 w-full">{t("wiz.next")}</Button>
              </View>
            ) : null}

            {/* ── 2 · details ── */}
            {step === S_DETAILS ? (
              <View className="mt-6 gap-4">
                <Text className="font-display text-[19px] font-semibold text-text">{t("wiz.details.heading")}</Text>
                <View className="flex-row items-center gap-2 self-start rounded-full bg-surface-raised px-3 py-1.5">
                  <Text className="text-[14px]">{kind.emoji}</Text>
                  <Text className="text-[12.5px] font-medium text-text">{t("wiz.details.locked", { kind: t(kind.nameKey) })}</Text>
                </View>
                <Input value={name} onChangeText={setName} placeholder={t("upload.titlePlaceholder")} />
                {kind.creditLabelKey ? (
                  <Input value={credit} onChangeText={setCredit} placeholder={t(kind.value === "music_video" ? "wiz.credit.placeholderArtist" : "wiz.credit.placeholderBrand")} />
                ) : null}
                <Input value={synopsis} onChangeText={setSynopsis} placeholder={t("upload.synopsis")} multiline style={{ height: 96, paddingTop: 12, textAlignVertical: "top" }} />

                {!kind.fixedCategory ? (
                  <View>
                    <Text className="mb-2 text-[13px] font-semibold text-muted">{t("library.category")}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {STORY_CATEGORIES.map((c) => <Chip key={c.value} label={t(c.labelKey)} active={category === c.value} onPress={() => setCategory(c.value)} />)}
                    </View>
                  </View>
                ) : null}

                {genres.length > 0 ? (
                  <View>
                    <Text className="mb-2 text-[13px] font-semibold text-muted">{t("upload.genre")}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {genres.map((g) => <Chip key={g} label={genreLabel(g)} active={genre === g} onPress={() => setGenre(genre === g ? "" : g)} />)}
                    </View>
                  </View>
                ) : null}

                <View>
                  <Text className="mb-2 text-[13px] font-semibold text-muted">{t("upload.rating")}</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {CONTENT_RATINGS.map((r) => <Chip key={r.value} label={t(`rating.${r.value}`)} active={rating === r.value} onPress={() => setRating(r.value)} />)}
                  </View>
                </View>

                <Banner message={error} />
                <Button onPress={saveDetails} disabled={saving || !name.trim()} className="w-full">{saving ? t("wiz.details.saving") : t("wiz.details.save")}</Button>
              </View>
            ) : null}

            {/* ── 3 · poster ── */}
            {step === S_POSTER && title ? (
              <View className="mt-6 gap-4">
                <Text className="font-display text-[19px] font-semibold text-text">{t("wiz.poster.heading")}</Text>
                <Text className="-mt-2 text-[12.5px] text-muted">{t("wiz.poster.hint")}</Text>
                <Pressable onPress={pickPoster} disabled={posterBusy} className="self-center overflow-hidden rounded-lg border border-dashed border-border bg-surface" style={{ width: 210, height: 280, opacity: posterBusy ? 0.7 : 1 }}>
                  {title.poster_url ? (
                    <Image source={{ uri: title.poster_url }} style={{ width: 210, height: 280 }} contentFit="cover" />
                  ) : (
                    <View className="flex-1 items-center justify-center gap-2">
                      <Icon as={ImagePlus} size={32} tone="muted" />
                      <Text className="text-[13px] text-muted">{t("wiz.poster.choose")}</Text>
                    </View>
                  )}
                  {posterBusy ? <View className="absolute inset-0 items-center justify-center bg-black/50"><ActivityIndicator color="#fff" /><Text className="mt-2 text-[12px] text-white">{t("wiz.poster.uploading")}</Text></View> : null}
                </Pressable>
                {title.poster_url ? (
                  <Pressable onPress={pickPoster} disabled={posterBusy} className="self-center" hitSlop={8}>
                    <Text className="text-[13px] font-semibold text-pink">{t("wiz.poster.change")}</Text>
                  </Pressable>
                ) : null}
                <Banner message={error} />
                <Button onPress={() => setStep(S_VIDEO)} disabled={posterBusy || !title.poster_url} className="w-full">{t("wiz.next")}</Button>
                {!title.poster_url ? (
                  <Pressable onPress={skipPoster} className="self-center py-1" hitSlop={8}>
                    <Text className="text-[13px] font-semibold text-muted">{t("wiz.poster.skip")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* ── 4 · video(s) ── */}
            {step === S_VIDEO && title ? (
              <View className="mt-6 gap-4">
                {!addMode ? <Text className="font-display text-[19px] font-semibold text-text">{t(kind.multi ? "wiz.video.headingEpisodes" : "wiz.video.headingPart")}</Text> : null}
                <Text className="-mt-1 text-[12.5px] text-muted">{t("wiz.video.hint", { max: kind.maxLabel })}</Text>

                {kind.multi ? (
                  <>
                    {episodes.filter((e) => e.episode_number > 0).map((e) => (
                      <View key={e.id} className="gap-2.5 rounded-lg border border-border bg-surface/50 p-3">
                        <View className="flex-row items-center gap-2">
                          <Icon as={Film} size={15} tone="muted" />
                          <Text numberOfLines={1} className="flex-1 text-[13.5px] font-semibold text-text">EP {e.episode_number}{e.name ? ` · ${e.name}` : ""}</Text>
                          <Text className="text-[12px] text-muted">{t(`upload.status.${e.status}`)}</Text>
                          <Pressable onPress={() => setConfirmDeleteEp(e)} disabled={slotBusy} hitSlop={8}><Icon as={Trash2} size={16} tone="muted" /></Pressable>
                        </View>
                        <UploadSlot
                          userId={user.id} titleId={title.id} slot={e.id} kind={kind} hasVideo={!!e.video_url}
                          doneKey={addMode ? "wiz.video.doneFinal" : "wiz.video.done"} onBusyChange={setSlotBusy}
                          onUploaded={(v) => saveEpisode(e, v, { number: e.episode_number, name: e.name, promo: false })}
                        />
                      </View>
                    ))}
                    <View className="gap-3 rounded-lg border border-pink p-3.5">
                      <Text className="text-[14px] font-semibold text-text">{promoMode ? t("upload.promoClip") : t("wiz.video.addEpisode")}</Text>
                      {!promoMode ? (
                        <View className="flex-row gap-3">
                          <View style={{ width: 110 }}>
                            <Input value={newNumber} onChangeText={(v) => setNewNumber(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="#" />
                          </View>
                          <View className="flex-1"><Input value={newName} onChangeText={setNewName} placeholder={t("upload.unitName.episode")} /></View>
                        </View>
                      ) : null}
                      <UploadSlot
                        key={newSlotKey} userId={user.id} titleId={title.id} slot={promoMode ? "promo" : `new-${newNumber}`} kind={kind} hasVideo={false}
                        doneKey={addMode ? "wiz.video.doneFinal" : "wiz.video.done"} onBusyChange={setSlotBusy}
                        onUploaded={(v) => saveEpisode(null, v, { number: parseInt(newNumber, 10) || 1, name: newName.trim() || null, promo: promoMode })}
                      />
                      {!promoMode && !addMode ? (
                        <Pressable onPress={() => setPromoMode(true)} hitSlop={8} disabled={slotBusy}><Text className="text-[12.5px] font-semibold text-pink">{t("upload.promoClip")}</Text></Pressable>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <UploadSlot
                    key={episodes[0]?.id ?? "single"} userId={user.id} titleId={title.id} slot={episodes[0]?.id ?? "single"} kind={kind} hasVideo={!!episodes[0]?.video_url}
                    doneKey={addMode ? "wiz.video.doneFinal" : "wiz.video.done"} onBusyChange={setSlotBusy}
                    onUploaded={(v) => saveEpisode(episodes[0] ?? null, v, { number: 1, name: null, promo: false })}
                  />
                )}

                <Banner message={error} />
                {!addMode ? (
                  <>
                    {slotBusy ? <Text className="text-center text-[12px] text-muted">{t("wiz.video.busy")}</Text> : videos.length === 0 ? <Text className="text-center text-[12px] text-muted">{t("wiz.video.needOne")}</Text> : null}
                    <Button onPress={() => setStep(S_REVIEW)} disabled={slotBusy || videos.length === 0} className="w-full">{t("wiz.video.next")}</Button>
                  </>
                ) : (
                  <Button variant="secondary" onPress={() => router.replace(`/creator/title/${title.id}` as never)} disabled={slotBusy} className="w-full">{t("common.back")}</Button>
                )}
              </View>
            ) : null}

            {/* ── 5 · review ── */}
            {step === S_REVIEW && title ? (
              <View className="mt-6 gap-4">
                <Text className="font-display text-[19px] font-semibold text-text">{t("wiz.review.heading")}</Text>
                <View className="flex-row gap-3.5 rounded-lg border border-border bg-surface p-3.5">
                  <View className="h-28 w-[84px] overflow-hidden rounded-md bg-surface-raised">
                    {title.poster_url ? <Image source={{ uri: title.poster_url }} style={{ width: 84, height: 112 }} contentFit="cover" /> : <View className="flex-1 items-center justify-center"><Text className="text-[28px]">{kind.emoji}</Text></View>}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={2} className="text-[16px] font-semibold text-text">{title.title}</Text>
                    <Text className="mt-0.5 text-[12.5px] text-muted">{t(kind.nameKey)}{title.credit_name ? ` · ${title.credit_name}` : ""}</Text>
                    <Text className="mt-0.5 text-[12.5px] text-muted">{[title.genre ? genreLabel(title.genre) : null, title.content_rating].filter(Boolean).join(" · ")}</Text>
                    {title.synopsis ? <Text numberOfLines={3} className="mt-1.5 text-[12.5px] leading-snug text-muted">{title.synopsis}</Text> : null}
                  </View>
                </View>

                <View className="gap-2.5 rounded-lg border border-border bg-surface p-3.5">
                  {[
                    { ok: true, label: t("wiz.review.details"), extra: "" },
                    { ok: !!title.poster_url, label: t("wiz.review.poster"), extra: "" },
                    { ok: videos.length > 0, label: t("wiz.review.videos"), extra: t("wiz.review.videosCount", { n: videos.length }) },
                  ].map((c) => (
                    <View key={c.label} className="flex-row items-center gap-2.5">
                      <CheckCircle2 size={18} color={c.ok ? colors.pink : colors.muted} />
                      <Text className="flex-1 text-[13.5px] text-text">{c.label}</Text>
                      <Text className="text-[12.5px] text-muted">{c.extra}</Text>
                    </View>
                  ))}
                </View>
                {!title.poster_url ? <Banner tone="info" message={t("wiz.review.noPoster")} /> : null}
                <Text className="text-[12.5px] leading-relaxed text-muted">{t("wiz.review.explain")}</Text>

                <Banner message={error} />
                <Button onPress={submitForReview} disabled={submitting || videos.length === 0} className="w-full">{submitting ? t("wiz.review.submitting") : t("wiz.review.submit")}</Button>
                <Button variant="secondary" onPress={() => router.canGoBack() ? router.back() : setView("landing")} disabled={submitting} className="w-full">{t("wiz.review.saveExit")}</Button>
              </View>
            ) : null}
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheet open={!!confirmDeleteEp} onClose={() => setConfirmDeleteEp(null)} title={t("upload.deleteUnit.episode")}>
        <View className="px-5 pb-5">
          <Text className="text-[14px] leading-relaxed text-muted">{t("upload.deleteConfirm.episode")}</Text>
          <View className="mt-5 flex-row gap-3">
            <Button variant="secondary" className="flex-1" onPress={() => setConfirmDeleteEp(null)}>{t("common.cancel")}</Button>
            <Button variant="danger" className="flex-1" disabled={deletingEp} onPress={() => confirmDeleteEp && removeEpisode(confirmDeleteEp)}>{deletingEp ? t("upload.deleting") : t("upload.confirm")}</Button>
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
