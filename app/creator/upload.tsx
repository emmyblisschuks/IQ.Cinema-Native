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
import { ArrowLeft, Film, ImagePlus, Plus, Video } from "lucide-react-native";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { uploadVideoResumable, type ResumableUpload } from "@/lib/supabase/resumableUpload";
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
type EpisodeRow = { id: string; episode_number: number; name: string | null; status: string };
type PickedVideo = { uri: string; duration: number; width: number; height: number; fileName?: string | null };

function slugify(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
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
  const { t } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { online } = useOnlineStatus();
  const { titleId: titleIdParam } = useLocalSearchParams<{ titleId?: string }>();

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
      supabase.from("episodes").select("id, episode_number, name, status").eq("title_id", id).order("episode_number", { ascending: false }),
    ]);
    if (ti) setTitle(ti as TitleRow);
    const list = (eps as EpisodeRow[]) ?? [];
    setUnits(list);
    setEpisodeNumber(String(list.reduce((m, e) => Math.max(m, e.episode_number), 0) + 1));
  }, []);

  useEffect(() => {
    if (titleId) void loadTitle(titleId);
  }, [titleId, loadTitle]);

  useEffect(() => () => activeUpload.current?.abort(), []);

  async function pickPoster() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setPoster({ uri: a.uri, mime: a.mimeType ?? "image/jpeg" });
  }

  async function pickVideo() {
    setVideoError(null);
    setNotice(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.accessPrivileges !== "limited") {
      setVideoError(t("upload.permission"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsEditing: false, quality: 1, videoExportPreset: ImagePicker.VideoExportPreset.Passthrough });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    // expo-image-picker reports duration in milliseconds.
    const duration = (a.duration ?? 0) / 1000;
    const picked: PickedVideo = { uri: a.uri, duration, width: a.width ?? 0, height: a.height ?? 0, fileName: a.fileName };
    setVideo(picked);
    const cfg = config;
    if (duration > cfg.maxSeconds + 1) {
      setVideoError(t("upload.err.tooLong", { label: t(cfg.labelKey), max: cfg.maxLabel, len: formatSeconds(duration) }));
    } else if (picked.height > 0 && Math.abs(picked.width / picked.height - ASPECT_TARGET) > ASPECT_TOLERANCE) {
      setVideoError(t("upload.err.notPortrait", { w: picked.width, h: picked.height }));
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

  async function saveEpisode(target: "draft" | "processing") {
    if (!user || !titleId) return;
    if (!online) return setError(t("upload.offline"));
    if (target === "processing" && !video) return setError(t(`upload.err.addVideo.${unit}`));
    if (video && videoError) return setError(videoError);

    setSaving(target === "draft" ? "draft" : "submit");
    setError(null);
    setNotice(null);

    let videoPath: string | null = null;
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
    }

    const { data: row, error: epErr } = await supabase
      .from("episodes")
      .insert({
        title_id: titleId,
        episode_number: parseInt(episodeNumber, 10) || 1,
        name: episodeName.trim() || null,
        video_url: videoPath,
        duration_seconds: video ? Math.round(video.duration) : undefined,
        video_width: video ? video.width : undefined,
        video_height: video ? video.height : undefined,
        status: target,
      })
      .select("id, episode_number, name, status")
      .single();
    setSaving(null);
    if (epErr || !row) {
      setError(epErr?.message ?? t("upload.err.uploadFailed"));
      return;
    }
    setUnits((prev) => [row as EpisodeRow, ...prev]);
    setEpisodeNumber(String((row as EpisodeRow).episode_number + 1));
    setEpisodeName("");
    setVideo(null);
    setVideoError(null);
    setNotice(target === "draft" ? t("upload.savedDraft") : t("upload.finalized"));
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
                      {genres.map((g) => <Chip key={g} label={g} active={genre === g} onPress={() => setGenre(genre === g ? "" : g)} />)}
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

            {/* ── Step 2: add an episode ──────────────────────────────── */}
            {titleId && title ? (
              <View className="mt-5 gap-4">
                <Text className="text-[12px] text-muted">{t(`upload.limits.${unit}`, { label: t(config.labelKey), max: config.maxLabel })}</Text>

                <View>
                  <Text className="mb-1.5 text-[13px] font-semibold text-muted">{t(`upload.unitNumber.${unit}`)}</Text>
                  <Input value={episodeNumber} onChangeText={(v) => setEpisodeNumber(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
                </View>
                <Input value={episodeName} onChangeText={setEpisodeName} placeholder={t(`upload.unitName.${unit}`)} />

                <Pressable onPress={pickVideo} disabled={busy} className="flex-row items-center gap-3 rounded-lg border border-dashed border-border bg-surface p-4" style={{ opacity: busy ? 0.6 : 1 }}>
                  <Icon as={Video} size={22} tone="pink" />
                  <View className="min-w-0 flex-1">
                    <Text className="text-[14px] font-medium text-text">{video ? t("upload.changeVideo") : t("upload.pickVideo")}</Text>
                    <Text className="mt-0.5 text-[12px] text-muted">
                      {video ? `${formatSeconds(video.duration)} · ${video.width}x${video.height}${videoError ? "" : " ✓"}` : t("upload.noVideo")}
                    </Text>
                  </View>
                </Pressable>
                {videoError ? <Text className="-mt-2 text-[12.5px] text-crimson">{videoError}</Text> : null}

                {progress !== null ? (
                  <View>
                    <View className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                      <View className="h-full rounded-full bg-pink" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </View>
                    <Text className="mt-1.5 text-[12px] text-muted">{t("upload.uploadingHint", { pct: Math.round(progress * 100) })}</Text>
                  </View>
                ) : null}

                <View className="flex-row gap-3">
                  <Button variant="secondary" className="flex-1" disabled={busy || !!videoError} onPress={() => saveEpisode("draft")}>
                    {saving === "draft" ? (progress !== null ? t("upload.uploadingPct", { pct: Math.round(progress * 100) }) : t("upload.saving")) : t("upload.saveDraft")}
                  </Button>
                  <Button className="flex-1" disabled={busy || !video || !!videoError} onPress={() => saveEpisode("processing")}>
                    {saving === "submit" ? (progress !== null ? t("upload.uploadingPct", { pct: Math.round(progress * 100) }) : t("upload.finalizing")) : t("upload.finalize")}
                  </Button>
                </View>
                <Text className="text-[11.5px] leading-relaxed text-muted">{t(`upload.footer.${unit}`)}</Text>

                {units.length > 0 ? (
                  <View className="mt-2">
                    <Text className="mb-2 text-[14px] font-semibold text-text">{t(`upload.inProject.${unit}`)}</Text>
                    <View className="gap-2">
                      {units.map((u) => (
                        <View key={u.id} className="flex-row items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
                          <Icon as={Film} size={16} tone="muted" />
                          <Text numberOfLines={1} className="flex-1 text-[13.5px] text-text">
                            {unit === "part" ? t("upload.partN", { n: u.episode_number }) : `EP ${u.episode_number}`}
                            {u.name ? ` · ${u.name}` : ""}
                          </Text>
                          <Text className="text-[12px] text-muted">{t(`upload.status.${u.status}`)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
