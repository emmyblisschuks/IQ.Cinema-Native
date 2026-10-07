// app/creator/upload.tsx
//
// Upload straight from the phone — no browser hand-off. Mirrors the web flow:
// pick or create a title, then add an episode (the video uploads resumably to
// private storage, the row is saved as a draft or finalized for processing).
//   /creator/upload             → choose a title / create a new one
//   /creator/upload?titleId=…   → add an episode to that title

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Film, FolderOpen, ImagePlus, Images, Plus, Trash2 } from "lucide-react-native";
import { File as FSFile } from "expo-file-system";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { uploadVideoResumable, type ResumableUpload } from "@/lib/supabase/resumableUpload";
import { readMp4Info } from "@/lib/mp4Info";
import { canGenerateStoryboard, generateStoryboardNative } from "@/lib/storyboardNative";
import { STORYBOARD_BUCKET, storyboardPath, uploadStoryboard } from "@/lib/storyboard";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { CATEGORIES, DEFAULT_CATEGORY, type Category } from "@/lib/categories";
import { CONTENT_RATINGS, type ContentRating } from "@/lib/contentRatings";
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

type ContentType = "short_episode" | "full_episode" | "one_part_film";
const CONTENT_TYPES: { value: ContentType; labelKey: string; unit: "episode" | "part"; maxSeconds: number; maxLabel: string }[] = [
  { value: "short_episode", labelKey: "upload.type.short", unit: "episode", maxSeconds: 160, maxLabel: "2m 40s" },
  { value: "full_episode", labelKey: "upload.type.full", unit: "episode", maxSeconds: 1200, maxLabel: "20m" },
  { value: "one_part_film", labelKey: "upload.type.film", unit: "part", maxSeconds: 7200, maxLabel: "120m" },
];
const ASPECT_TARGET = 9 / 16;
const ASPECT_TOLERANCE = 0.02;

type TitleRow = { id: string; title: string; status: string; content_type: ContentType; poster_url: string | null };
type EpisodeRow = { id: string; episode_number: number; name: string | null; status: string; video_url: string | null; is_promo: boolean };
type PickedVideo = { uri: string; duration: number; width: number; height: number; size: number; fastStart: boolean | null };

function slugify(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function formatBytes(b: number) {
  const mb = b / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}
function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m ${sec}s` : `${m}m ${sec}s`;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={clsx("rounded-full border px-3.5 py-2", active ? "border-pink bg-pink" : "border-border bg-surface")}>
      <Text className={clsx("text-[13px] font-medium", active ? "text-white" : "text-text")}>{label}</Text>
    </Pressable>
  );
}

export default function UploadScreen() {
  const { t, genre: genreLabel } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { online } = useOnlineStatus();
  const { titleId: titleIdParam, promo: promoParam, episodeId: episodeIdParam } = useLocalSearchParams<{ titleId?: string; promo?: string; episodeId?: string }>();

  const [titleId, setTitleId] = useState<string | null>(titleIdParam ?? null);
  const [myTitles, setMyTitles] = useState<TitleRow[] | null>(null);
  const [title, setTitle] = useState<TitleRow | null>(null);
  const [creating, setCreating] = useState(false); // new-title form open

  // new title form
  const [name, setName] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [contentType, setContentType] = useState<ContentType>("full_episode");
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [rating, setRating] = useState<ContentRating>("13+");
  const [genres, setGenres] = useState<string[]>([]);
  const [genre, setGenre] = useState("");
  const [poster, setPoster] = useState<{ uri: string; mime: string } | null>(null);

  // episode form
  const [units, setUnits] = useState<EpisodeRow[]>([]);
  const [episodeNumber, setEpisodeNumber] = useState("1");
  const [episodeName, setEpisodeName] = useState("");
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [episodeRowId, setEpisodeRowId] = useState<string | null>(null); // editing an existing row
  const [existingVideoUrl, setExistingVideoUrl] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [isPromoMode, setIsPromoMode] = useState(promoParam === "1");
  const [buildingPreview, setBuildingPreview] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeUpload = useRef<ResumableUpload | null>(null);

  const config = useMemo(() => CONTENT_TYPES.find((c) => c.value === (title?.content_type ?? contentType))!, [title, contentType]);
  const unit = config.unit;

  // The creator's own titles (to add episodes to) + the genre list.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("titles")
      .select("id, title, status, content_type, poster_url")
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setMyTitles((data as TitleRow[]) ?? []));
    supabase
      .from("genres")
      .select("name")
      .order("name")
      .then(({ data }) => setGenres((data ?? []).map((g) => g.name as string)));
  }, [user]);

  const loadTitle = useCallback(async (id: string) => {
    const [{ data: ti }, { data: eps }] = await Promise.all([
      supabase.from("titles").select("id, title, status, content_type, poster_url").eq("id", id).single(),
      supabase.from("episodes").select("id, episode_number, name, status, video_url, is_promo").eq("title_id", id).order("episode_number", { ascending: false }),
    ]);
    if (ti) setTitle(ti as TitleRow);
    const list = ((eps as EpisodeRow[]) ?? []);
    setUnits(list);
    setEpisodeNumber(String(list.reduce((m, e) => Math.max(m, e.episode_number), 0) + 1));
    return list;
  }, []);

  useEffect(() => {
    if (!titleId) return;
    loadTitle(titleId).then((list) => {
      // Arrived from the title page on a specific episode → open it for editing.
      const target = episodeIdParam ? list?.find((u) => u.id === episodeIdParam) : null;
      if (target) editUnit(target);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleId, loadTitle]);

  useEffect(() => () => activeUpload.current?.abort(), []);

  async function pickPoster() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setPoster({ uri: a.uri, mime: a.mimeType ?? "image/jpeg" });
  }

  // Reads the real duration / size / layout from the file's own MP4 boxes, so
  // the checks don't rely on what a given phone's picker reports.
  async function inspect(uri: string, pickerMeta?: { duration?: number | null; width?: number; height?: number }) {
    setCheckingVideo(true);
    setVideoError(null);
    setNotice(null);
    try {
      const info = await readMp4Info(uri);
      const duration = info.duration ?? (pickerMeta?.duration ? pickerMeta.duration / 1000 : 0);
      const width = info.width ?? pickerMeta?.width ?? 0;
      const height = info.height ?? pickerMeta?.height ?? 0;
      if (!duration || !width || !height) {
        setVideo(null);
        setVideoError(t("upload.err.readVideo"));
        return;
      }
      const picked: PickedVideo = { uri, duration, width, height, size: info.size, fastStart: info.fastStart };
      setVideo(picked);
      if (duration > config.maxSeconds + 1) {
        setVideoError(t("upload.err.tooLong", { label: t(config.labelKey), max: config.maxLabel, len: formatSeconds(duration) }));
      } else if (Math.abs(width / height - ASPECT_TARGET) > ASPECT_TOLERANCE) {
        setVideoError(t("upload.err.notPortrait", { w: width, h: height }));
      }
    } finally {
      setCheckingVideo(false);
    }
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.accessPrivileges !== "limited") {
      setVideoError(t("upload.permission"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false, // editing would trim and re-encode the video
      quality: 1,
      videoExportPreset: ImagePicker.VideoExportPreset.Passthrough, // iOS: keep the original encoding
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await inspect(a.uri, { duration: a.duration, width: a.width, height: a.height });
  }

  // The file picker hands back the original bytes untouched.
  async function pickFromFiles() {
    try {
      const picked = await FSFile.pickFileAsync(undefined, "video/*");
      const f = Array.isArray(picked) ? picked[0] : picked;
      if (!f) return;
      await inspect(f.uri);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).toLowerCase();
      if (msg.includes("cancel")) return;
      setVideoError(t("upload.err.readVideo"));
    }
  }

  async function createTitle() {
    if (!user) return;
    if (!online) return setError(t("upload.offline"));
    if (!name.trim()) return;
    setSaving("submit");
    setError(null);

    let posterUrl: string | null = null;
    if (poster) {
      const ext = poster.mime.includes("png") ? "png" : "jpg";
      const path = `${user.id}/${uuid()}-poster.${ext}`;
      try {
        const bytes = await (await fetch(poster.uri)).arrayBuffer();
        const { error: upErr } = await supabase.storage.from("posters").upload(path, bytes, { contentType: poster.mime });
        if (upErr) throw upErr;
        posterUrl = supabase.storage.from("posters").getPublicUrl(path).data.publicUrl;
      } catch (e) {
        setError((e as Error).message ?? t("upload.err.uploadFailed"));
        setSaving(null);
        return;
      }
    }

    const { data: row, error: insErr } = await supabase
      .from("titles")
      .insert({
        creator_id: user.id,
        title: name.trim(),
        slug: slugify(name) || uuid().slice(0, 8),
        synopsis,
        content_type: contentType,
        poster_url: posterUrl,
        genre: genre || null,
        category,
        content_rating: rating,
        status: "draft",
      })
      .select("id, title, status, content_type, poster_url")
      .single();
    setSaving(null);
    if (insErr || !row) {
      setError(insErr?.code === "23505" ? t("upload.err.titleExists") : insErr?.message ?? t("upload.err.createTitle"));
      return;
    }
    setCreating(false);
    setTitle(row as TitleRow);
    setTitleId(row.id);
  }

  function resetForNextUnit(list?: EpisodeRow[]) {
    const src = list ?? units;
    setEpisodeRowId(null);
    setExistingVideoUrl(null);
    setExistingStatus(null);
    setEpisodeName("");
    setVideo(null);
    setVideoError(null);
    setIsPromoMode(false);
    setEpisodeNumber(String(src.reduce((m, e) => Math.max(m, e.episode_number), 0) + 1));
  }

  function editUnit(u: EpisodeRow) {
    if (busy) return;
    setEpisodeRowId(u.id);
    setEpisodeNumber(String(u.episode_number));
    setEpisodeName(u.name ?? "");
    setExistingVideoUrl(u.video_url);
    setExistingStatus(u.status);
    setIsPromoMode(u.is_promo && u.episode_number === 0);
    setVideo(null);
    setVideoError(null);
    setNotice(null);
    setError(null);
  }

  async function saveEpisode(target: "draft" | "processing") {
    if (!user || !titleId) return;
    if (!online) return setError(t("upload.offline"));
    if (checkingVideo) return setError(t("upload.err.stillChecking"));
    if (target === "processing" && !video && !existingVideoUrl) return setError(t(`upload.err.addVideo.${unit}`));
    if (video && videoError) return setError(videoError);

    setSaving(target === "draft" ? "draft" : "submit");
    setError(null);
    setNotice(null);

    let videoPath: string | null = existingVideoUrl;
    const oldVideoPath = existingVideoUrl;
    const isReplacing = !!video && !!oldVideoPath;

    if (video) {
      const path = `${user.id}/${titleId}/${uuid()}.mp4`;
      setProgress(0);
      const up = uploadVideoResumable({ bucket: "videos", path, uri: video.uri, onProgress: setProgress });
      activeUpload.current = up;
      try {
        // The episode row is only written once the upload has fully finished.
        await up.promise;
      } catch (e) {
        setError((e as Error)?.message || t("upload.err.uploadFailed"));
        setSaving(null);
        setProgress(null);
        return;
      } finally {
        activeUpload.current = null;
      }
      setProgress(null);
      videoPath = path;

      // Scrub-preview strip, built from the LOCAL file and stored as one small
      // image so viewers scrub against it instead of the video. Best-effort —
      // the episode saves without it.
      if (canGenerateStoryboard()) {
        setBuildingPreview(0);
        try {
          const strip = await generateStoryboardNative(video.uri, video.duration, setBuildingPreview);
          await uploadStoryboard(supabase, path, strip);
        } catch {
          /* non-fatal: the player falls back to a plain scrub box */
        } finally {
          setBuildingPreview(null);
        }
      }
    }

    const payload = {
      title_id: titleId,
      episode_number: isPromoMode ? 0 : parseInt(episodeNumber, 10) || 1,
      name: episodeName.trim() || null,
      video_url: videoPath,
      duration_seconds: video ? Math.round(video.duration) : undefined,
      video_width: video ? video.width : undefined,
      video_height: video ? video.height : undefined,
      status: target,
    };
    const { data: row, error: epErr } = episodeRowId
      ? await supabase.from("episodes").update(payload).eq("id", episodeRowId).select("id, episode_number, name, status, video_url, is_promo").single()
      : await supabase.from("episodes").insert(payload).select("id, episode_number, name, status, video_url, is_promo").single();
    setSaving(null);
    if (epErr || !row) {
      setError(epErr?.message ?? t("upload.err.uploadFailed"));
      return;
    }

    // A replaced video leaves the old storage object orphaned: clean it up now
    // that the row points at the new one. Best-effort.
    if (isReplacing && oldVideoPath && oldVideoPath !== videoPath) {
      supabase.storage.from("videos").remove([oldVideoPath]).then(() => {}, () => {});
      supabase.storage.from(STORYBOARD_BUCKET).remove([storyboardPath(oldVideoPath)]).then(() => {}, () => {});
    }

    const saved = row as EpisodeRow;
    if (isPromoMode) {
      const { data: promoResult, error: promoErr } = await supabase.rpc("set_promo_episode", { p_title_id: titleId, p_episode_id: saved.id });
      if (promoErr || !promoResult?.ok) setError(promoErr?.message || promoResult?.error || t("upload.err.promoFailed"));
    }

    const next = [saved, ...units.filter((u) => u.id !== saved.id)].sort((a, b) => b.episode_number - a.episode_number);
    setUnits(next);
    setNotice(target === "draft" ? t("upload.savedDraft") : t("upload.finalized"));
    // Stay on the saved row (a later Finalize must not re-upload the same
    // file): the picked file is cleared, the saved path carries forward.
    setEpisodeRowId(saved.id);
    setExistingVideoUrl(saved.video_url);
    setExistingStatus(saved.status);
    setVideo(null);
  }

  async function deleteEpisode(id: string) {
    setDeleting(true);
    setError(null);
    const target = units.find((u) => u.id === id);
    const { error: delErr } = await supabase.from("episodes").delete().eq("id", id);
    setDeleting(false);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    if (target?.video_url) {
      supabase.storage.from("videos").remove([target.video_url]).then(() => {}, () => {});
      supabase.storage.from(STORYBOARD_BUCKET).remove([storyboardPath(target.video_url)]).then(() => {}, () => {});
    }
    const next = units.filter((u) => u.id !== id);
    setUnits(next);
    setConfirmDeleteId(null);
    if (episodeRowId === id) resetForNextUnit(next);
  }

  const busy = saving !== null;
  const goBack = () => {
    if (titleId && !titleIdParam) {
      setTitleId(null);
      setTitle(null);
      setUnits([]);
      setVideo(null);
      return;
    }
    router.canGoBack() ? router.back() : router.replace("/creator/dashboard" as never);
  };

  if (authLoading) return <SafeAreaView className="flex-1 items-center justify-center bg-bg"><ActivityIndicator color={colors.muted} /></SafeAreaView>;
  if (!user) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-bg px-8">
        <Text className="text-center text-[15px] text-muted">{t("profile.guestBody")}</Text>
        <Button onPress={() => router.push("/auth/login" as never)}>{t("profile.signIn")}</Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <FadeIn>
            <View className="flex-row items-center gap-3">
              <Pressable onPress={goBack} hitSlop={10} accessibilityLabel={t("common.back")}>
                <Icon as={ArrowLeft} size={20} tone="text" />
              </Pressable>
              <Text numberOfLines={1} className="flex-1 font-display text-2xl font-semibold text-text">
                {title ? title.title : creating ? t("upload.newTitle") : t("upload.title")}
              </Text>
            </View>

            {error ? <View className="mt-4 rounded-md bg-crimson-soft px-3 py-2"><Text className="text-[13px] text-crimson">{error}</Text></View> : null}
            {notice ? <View className="mt-4 rounded-md bg-surface-raised px-3 py-2"><Text className="text-[13px] text-text">{notice}</Text></View> : null}

            {/* ── Step 1a: choose a title ─────────────────────────────── */}
            {!titleId && !creating ? (
              <View className="mt-5">
                <Button onPress={() => setCreating(true)} className="w-full">
                  <Icon as={Plus} size={16} tone="white" />
                  {t("upload.createNew")}
                </Button>

                <Text className="mb-2 mt-6 text-[13px] font-semibold text-muted">{t("upload.myTitles")}</Text>
                {myTitles === null ? (
                  <ActivityIndicator color={colors.muted} />
                ) : myTitles.length === 0 ? (
                  <Text className="text-[13px] text-muted">{t("upload.noTitles")}</Text>
                ) : (
                  <View className="gap-2">
                    {myTitles.map((ti) => (
                      <Pressable key={ti.id} onPress={() => setTitleId(ti.id)} className="flex-row items-center gap-3 rounded-lg border border-border bg-surface p-3">
                        <View className="h-14 w-10 overflow-hidden rounded-md bg-surface-raised">
                          {ti.poster_url ? <Image source={{ uri: ti.poster_url }} style={{ width: 40, height: 56 }} contentFit="cover" /> : null}
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={1} className="text-[14.5px] font-semibold text-text">{ti.title}</Text>
                          <Text className="mt-0.5 text-[12px] capitalize text-muted">{ti.status.replace("_", " ")}</Text>
                        </View>
                        <Icon as={Plus} size={18} tone="pink" />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ) : null}

            {/* ── Step 1b: new title ──────────────────────────────────── */}
            {!titleId && creating ? (
              <View className="mt-5 gap-4">
                <View className="flex-row flex-wrap gap-2">
                  {CONTENT_TYPES.map((c) => (
                    <Chip key={c.value} label={t(c.labelKey)} active={contentType === c.value} onPress={() => setContentType(c.value)} />
                  ))}
                </View>
                <Text className="-mt-1 text-[12px] text-muted">{t(`upload.limits.${config.unit}`, { label: t(config.labelKey), max: config.maxLabel })}</Text>

                <Input value={name} onChangeText={setName} placeholder={t("upload.titlePlaceholder")} />
                <Input value={synopsis} onChangeText={setSynopsis} placeholder={t("upload.synopsis")} multiline style={{ height: 96, paddingTop: 12, textAlignVertical: "top" }} />

                <View>
                  <Text className="mb-2 text-[13px] font-semibold text-muted">{t("foryou.collection")}</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {CATEGORIES.map((c) => <Chip key={c.value} label={t(c.labelKey)} active={category === c.value} onPress={() => setCategory(c.value)} />)}
                  </View>
                </View>

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
                    {CONTENT_RATINGS.map((r) => <Chip key={r.value} label={r.value} active={rating === r.value} onPress={() => setRating(r.value)} />)}
                  </View>
                </View>

                <Pressable onPress={pickPoster} className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface p-3">
                  <View className="h-16 w-12 items-center justify-center overflow-hidden rounded-md bg-surface-raised">
                    {poster ? <Image source={{ uri: poster.uri }} style={{ width: 48, height: 64 }} contentFit="cover" /> : <Icon as={ImagePlus} size={20} tone="muted" />}
                  </View>
                  <Text className="flex-1 text-[13.5px] text-text">{poster ? t("upload.posterChosen") : t("upload.poster")}</Text>
                </Pressable>

                <Button onPress={createTitle} disabled={busy || !name.trim()} className="w-full">
                  {busy ? t("upload.creating") : t("upload.continue")}
                </Button>
              </View>
            ) : null}

            {/* ── Step 2: add / edit an episode ───────────────────────── */}
            {titleId && title ? (
              <View className="mt-5 gap-4">
                <Text className="text-[12px] text-muted">{t(`upload.limits.${unit}`, { label: t(config.labelKey), max: config.maxLabel })}</Text>

                {isPromoMode ? (
                  <View className="rounded-md bg-surface-raised px-3 py-2.5">
                    <Text className="text-[12.5px] font-semibold text-text">{t("upload.promoClip")}</Text>
                    <Text className="mt-0.5 text-[12px] text-muted">{t(`upload.promoNotNumbered.${unit}`)}</Text>
                  </View>
                ) : (
                  <View>
                    <Text className="mb-1.5 text-[13px] font-semibold text-muted">{t(`upload.unitNumber.${unit}`)}</Text>
                    <Input value={episodeNumber} onChangeText={(v) => setEpisodeNumber(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
                  </View>
                )}
                <Input value={episodeName} onChangeText={setEpisodeName} placeholder={t(`upload.unitName.${unit}`)} />

                <View>
                  <Text className="mb-2 text-[13px] font-semibold text-muted">{t("upload.videoFile")}</Text>
                  <View className="flex-row gap-3">
                    <Pressable onPress={pickFromGallery} disabled={busy || checkingVideo} className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface py-3.5" style={{ opacity: busy ? 0.6 : 1 }}>
                      <Icon as={Images} size={18} tone="pink" />
                      <Text className="text-[13.5px] font-medium text-text">{t("upload.fromGallery")}</Text>
                    </Pressable>
                    <Pressable onPress={pickFromFiles} disabled={busy || checkingVideo} className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface py-3.5" style={{ opacity: busy ? 0.6 : 1 }}>
                      <Icon as={FolderOpen} size={18} tone="pink" />
                      <Text className="text-[13.5px] font-medium text-text">{t("upload.fromFiles")}</Text>
                    </Pressable>
                  </View>
                  <Text className="mt-2 text-[12px] text-muted">
                    {checkingVideo
                      ? t("upload.checkingVideo")
                      : video
                        ? `${formatSeconds(video.duration)} · ${video.width}x${video.height} · ${formatBytes(video.size)}${videoError ? "" : " ✓"}${existingVideoUrl ? t("upload.willReplace") : ""}`
                        : existingVideoUrl
                          ? t("upload.videoAttached")
                          : t("upload.noVideo")}
                  </Text>
                  {videoError ? <Text className="mt-1 text-[12.5px] text-crimson">{videoError}</Text> : null}
                  {video && !videoError && video.fastStart === false ? (
                    <Text className="mt-1 text-[12.5px]" style={{ color: colors.pink }}>{t("upload.warn.fastStart")}</Text>
                  ) : null}
                </View>

                {progress !== null ? (
                  <View>
                    <View className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                      <View className="h-full rounded-full bg-pink" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </View>
                    <Text className="mt-1.5 text-[12px] text-muted">{t("upload.uploadingHint", { pct: Math.round(progress * 100) })}</Text>
                  </View>
                ) : null}
                {buildingPreview !== null ? (
                  <Text className="text-[12px] text-muted">{t("upload.buildingPct", { pct: Math.round(buildingPreview * 100) })}</Text>
                ) : null}

                <View className="flex-row gap-3">
                  <Button variant="secondary" className="flex-1" disabled={busy || checkingVideo || !!videoError} onPress={() => saveEpisode("draft")}>
                    {saving === "draft" ? (progress !== null ? t("upload.uploadingPct", { pct: Math.round(progress * 100) }) : t("upload.saving")) : t("upload.saveDraft")}
                  </Button>
                  <Button className="flex-1" disabled={busy || checkingVideo || (!video && !existingVideoUrl) || !!videoError} onPress={() => saveEpisode("processing")}>
                    {saving === "submit" ? (progress !== null ? t("upload.uploadingPct", { pct: Math.round(progress * 100) }) : t("upload.finalizing")) : t("upload.finalize")}
                  </Button>
                </View>
                <Text className="text-[11.5px] leading-relaxed text-muted">{t(`upload.footer.${unit}`)}</Text>

                <View className="flex-row flex-wrap gap-x-5 gap-y-2">
                  {episodeRowId ? (
                    <Pressable onPress={() => { resetForNextUnit(); setNotice(null); }} disabled={busy}>
                      <Text className="text-[13px] font-semibold text-pink">{t(`upload.addAnother.${unit}`)}</Text>
                    </Pressable>
                  ) : null}
                  {!episodeRowId && !isPromoMode ? (
                    <Pressable onPress={() => setIsPromoMode(true)} disabled={busy}>
                      <Text className="text-[13px] font-semibold text-pink">{t("upload.promoClip")}</Text>
                    </Pressable>
                  ) : null}
                  {episodeRowId ? (
                    <Pressable onPress={() => setConfirmDeleteId(episodeRowId)} disabled={busy} className="flex-row items-center gap-1.5">
                      <Icon as={Trash2} size={14} tone="crimson" />
                      <Text className="text-[13px] font-semibold text-crimson">{t(`upload.deleteUnit.${unit}`)}</Text>
                    </Pressable>
                  ) : null}
                </View>

                {units.length > 0 ? (
                  <View className="mt-2">
                    <Text className="mb-2 text-[14px] font-semibold text-text">{t(`upload.inProject.${unit}`)}</Text>
                    <View className="gap-2">
                      {units.map((u) => (
                        <Pressable
                          key={u.id}
                          onPress={() => editUnit(u)}
                          className={clsx("flex-row items-center gap-3 rounded-lg border bg-surface px-3 py-2.5", episodeRowId === u.id ? "border-pink" : "border-border")}
                        >
                          <Icon as={Film} size={16} tone="muted" />
                          <Text numberOfLines={1} className="flex-1 text-[13.5px] text-text">
                            {u.is_promo && u.episode_number === 0 ? t("upload.promoClip") : unit === "part" ? t("upload.partN", { n: u.episode_number }) : `EP ${u.episode_number}`}
                            {u.name ? ` · ${u.name}` : ""}
                          </Text>
                          <Text className="text-[12px] text-muted">{t(`upload.status.${u.status}`)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheet open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} title={t(`upload.deleteUnit.${unit}`)}>
        <View className="px-5 pb-5">
          <Text className="text-[14px] leading-relaxed text-muted">{t(`upload.deleteConfirm.${unit}`)}</Text>
          <View className="mt-5 flex-row gap-3">
            <Button variant="secondary" className="flex-1" onPress={() => setConfirmDeleteId(null)}>{t("common.cancel")}</Button>
            <Button variant="danger" className="flex-1" disabled={deleting} onPress={() => confirmDeleteId && deleteEpisode(confirmDeleteId)}>
              {deleting ? t("upload.deleting") : t("upload.confirm")}
            </Button>
          </View>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
