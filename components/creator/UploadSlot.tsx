// components/creator/UploadSlot.tsx
//
// One video, from "choose" to "saved": pick → check → upload (live progress,
// speed, time left, automatic reconnect) → preview strip → save. Every failure
// shows up *inside this card*, next to the button that caused it.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { File as FSFile } from "expo-file-system";
import { CheckCircle2, FolderOpen, Images, RotateCw, TriangleAlert, X } from "lucide-react-native";
import { createClient } from "@/lib/supabase/client";
import { uploadVideo, resumeKeyFor, UploadError, type UploadUpdate } from "@/lib/videoUpload";
import { canGenerateStoryboard, generateStoryboardNative } from "@/lib/storyboardNative";
import { uploadStoryboard } from "@/lib/storyboard";
import { formatBytes, formatEta, formatSpeed, type MeterSnapshot } from "@/lib/progressMeter";
import { formatDuration, inspectVideo, isPortrait916, type PickedVideo } from "@/lib/videoInspect";
import type { ContentKind } from "@/lib/contentTypes";
import { useI18n } from "@/hooks/useI18n";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Text } from "@/components/ui/Text";

const supabase = createClient();

export type UploadedVideo = { path: string; durationSeconds: number; width: number; height: number };

type Phase = "idle" | "checking" | "ready" | "uploading" | "preview" | "saving" | "done" | "error";

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

export function UploadSlot({
  userId,
  titleId,
  slot,
  kind,
  hasVideo,
  doneKey,
  onBusyChange,
  onUploaded,
}: {
  userId: string;
  titleId: string;
  slot: string; // episode id, or "new"
  kind: ContentKind;
  hasVideo: boolean; // this slot already has a saved video
  doneKey: string; // translation key for the success line
  onBusyChange?: (busy: boolean) => void;
  onUploaded: (v: UploadedVideo) => Promise<void>; // saves the row; throw to report a failure
}) {
  const { t, lang } = useI18n();
  const { colors } = useTheme();
  const { online } = useOnlineStatus();

  const [phase, setPhase] = useState<Phase>(hasVideo ? "done" : "idle");
  const [picked, setPicked] = useState<PickedVideo | null>(null);
  const [problem, setProblem] = useState<string | null>(null); // validation of the picked file
  const [snap, setSnap] = useState<MeterSnapshot | null>(null);
  const [update, setUpdate] = useState<UploadUpdate | null>(null);
  const [previewPct, setPreviewPct] = useState(0);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [cancelledNote, setCancelledNote] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const uploadedRef = useRef<UploadedVideo | null>(null); // upload finished, save pending (retry saves only)

  const busy = phase === "checking" || phase === "uploading" || phase === "preview" || phase === "saving";
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (hasVideo && phase === "idle") setPhase("done");
  }, [hasVideo, phase]);

  const reset = useCallback(() => {
    setPicked(null);
    setProblem(null);
    setError(null);
    setSnap(null);
    setUpdate(null);
    setCancelledNote(false);
    uploadedRef.current = null;
    setPhase("idle");
  }, []);

  async function handlePicked(uri: string, meta?: { duration?: number | null; width?: number; height?: number }) {
    setPhase("checking");
    setError(null);
    setCancelledNote(false);
    uploadedRef.current = null;
    let video: PickedVideo | null = null;
    try {
      video = await inspectVideo(uri, meta);
    } catch {
      video = null;
    }
    if (!video) {
      setPicked(null);
      setProblem(t("upload.err.readVideo"));
      setPhase("idle");
      return;
    }
    setPicked(video);
    if (video.duration > kind.maxSeconds + 1) {
      setProblem(t("upload.err.tooLong", { label: t(kind.nameKey), max: kind.maxLabel, len: formatDuration(video.duration) }));
    } else if (!isPortrait916(video.width, video.height)) {
      setProblem(t("upload.err.notPortrait", { w: video.width, h: video.height }));
    } else {
      setProblem(null);
    }
    setPhase("ready");
  }

  async function pickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.accessPrivileges !== "limited") {
      setProblem(t("upload.permission"));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false, // editing would trim and re-encode the video
      quality: 1,
      videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await handlePicked(a.uri, { duration: a.duration, width: a.width, height: a.height });
  }

  async function pickFromFiles() {
    try {
      const f = await FSFile.pickFileAsync(undefined, "video/*");
      const file = Array.isArray(f) ? f[0] : f;
      if (!file) return;
      await handlePicked(file.uri);
    } catch (e) {
      if (String((e as Error)?.message ?? e).toLowerCase().includes("cancel")) return;
      setProblem(t("upload.err.readVideo"));
    }
  }

  const fail = (e: unknown) => {
    const message =
      e instanceof UploadError ? e.message : t("upload.err.uploadFailed");
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    setError({ message, detail });
    setPhase("error");
  };

  async function start() {
    if (!picked || problem) return;
    if (!online) {
      setError({ message: t("upload.offline") });
      setPhase("error");
      return;
    }
    setError(null);
    setShowDetail(false);
    setCancelledNote(false);

    // Retry after the file already uploaded → only the save step is repeated.
    if (uploadedRef.current) {
      await save(uploadedRef.current);
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("uploading");
    setSnap(null);
    setUpdate({ phase: "starting" });

    // A stable object path per (title, slot, file): a retry or a later session
    // continues the SAME upload instead of creating a second copy.
    const key = resumeKeyFor(titleId, slot, picked.size, picked.duration);
    const pathKey = `tuspath:v1:${key}`;
    let path = await AsyncStorage.getItem(pathKey);
    if (!path) {
      const ext = /\.mov(\?|$)/i.test(picked.uri) ? "mov" : "mp4";
      path = `${userId}/${titleId}/${uuid()}.${ext}`;
      await AsyncStorage.setItem(pathKey, path);
    }

    try {
      await uploadVideo({
        uri: picked.uri,
        path,
        resumeKey: key,
        signal: ac.signal,
        onProgress: setSnap,
        onUpdate: setUpdate,
      });
    } catch (e) {
      if (e instanceof UploadError && e.code === "aborted") {
        setCancelledNote(true);
        setPhase("ready");
        return;
      }
      fail(e);
      return;
    } finally {
      abortRef.current = null;
    }
    await AsyncStorage.removeItem(pathKey);

    // Scrub-preview strip: best-effort, never blocks the save.
    if (canGenerateStoryboard()) {
      setPhase("preview");
      setPreviewPct(0);
      try {
        const strip = await generateStoryboardNative(picked.uri, picked.duration, setPreviewPct);
        await uploadStoryboard(supabase, path, strip);
      } catch {
        /* non-fatal */
      }
    }

    const result: UploadedVideo = { path, durationSeconds: Math.round(picked.duration), width: picked.width, height: picked.height };
    uploadedRef.current = result;
    await save(result);
  }

  async function save(result: UploadedVideo) {
    setPhase("saving");
    try {
      await onUploaded(result);
      uploadedRef.current = null;
      setPhase("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError({ message: t("wiz.err.saveFailed", { msg }), detail: msg });
      setPhase("error");
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  // ───────────────────────────── render ─────────────────────────────

  if (phase === "done") {
    return (
      <View className="rounded-lg border border-border bg-surface p-3.5">
        <View className="flex-row items-center gap-2.5">
          <CheckCircle2 size={20} color={colors.pink} />
          <Text className="flex-1 text-[13.5px] font-medium text-text">{t(doneKey)}</Text>
        </View>
        <Pressable onPress={reset} className="mt-2.5 self-start" hitSlop={8}>
          <Text className="text-[13px] font-semibold text-pink">{t("wiz.video.replace")}</Text>
        </Pressable>
      </View>
    );
  }

  const uploading = phase === "uploading";
  const pct = Math.round((snap?.fraction ?? 0) * 100);
  const phaseText =
    !update
      ? ""
      : update.phase === "starting"
        ? t("wiz.video.phaseStarting")
        : update.phase === "resuming"
          ? t("wiz.video.phaseResuming")
          : update.phase === "retrying"
            ? t("wiz.video.phaseRetrying", { n: update.attempt ?? 1 })
            : update.phase === "finishing"
              ? t("wiz.video.phaseFinishing")
              : update.phase === "verifying"
                ? t("wiz.video.phaseVerifying")
                : t("wiz.video.phaseUploading");

  return (
    <View className="gap-3">
      {/* choose */}
      {phase === "idle" || phase === "checking" ? (
        <View className="gap-2">
          <View className="flex-row gap-3">
            <Pressable onPress={pickFromGallery} disabled={phase === "checking"} className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface py-4" style={{ opacity: phase === "checking" ? 0.6 : 1 }}>
              <Icon as={Images} size={18} tone="pink" />
              <Text className="text-[13.5px] font-medium text-text">{t("upload.fromGallery")}</Text>
            </Pressable>
            <Pressable onPress={pickFromFiles} disabled={phase === "checking"} className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface py-4" style={{ opacity: phase === "checking" ? 0.6 : 1 }}>
              <Icon as={FolderOpen} size={18} tone="pink" />
              <Text className="text-[13.5px] font-medium text-text">{t("upload.fromFiles")}</Text>
            </Pressable>
          </View>
          <Text className="text-[12px] text-muted">{phase === "checking" ? t("upload.checkingVideo") : t("wiz.video.hint", { max: kind.maxLabel })}</Text>
        </View>
      ) : null}

      {/* picked file summary */}
      {picked && (phase === "ready" || phase === "error") ? (
        <View className="rounded-lg border border-border bg-surface p-3.5">
          <Text className="text-[13.5px] font-semibold text-text">{problem ? t("wiz.video.chooseOther") : t("wiz.video.ready")}</Text>
          <Text className="mt-1 text-[12.5px] text-muted">
            {t("wiz.video.fileMeta", { len: formatDuration(picked.duration), w: picked.width, h: picked.height, size: formatBytes(picked.size) })}
          </Text>
          {problem ? <Text className="mt-2 text-[12.5px] text-crimson">{problem}</Text> : null}
          {!problem && picked.fastStart === false ? <Text className="mt-2 text-[12px] text-pink">{t("upload.warn.fastStart")}</Text> : null}
          {cancelledNote ? <Text className="mt-2 text-[12px] text-muted">{t("wiz.video.cancelledNote")}</Text> : null}
          {phase === "ready" ? (
            <View className="mt-3 gap-2">
              {!problem ? (
                <Button onPress={start} disabled={!online}>
                  {t("wiz.video.uploadBtn", { size: formatBytes(picked.size) })}
                </Button>
              ) : null}
              <Pressable onPress={reset} hitSlop={8} className="self-center py-1">
                <Text className="text-[13px] font-semibold text-pink">{t("wiz.video.chooseOther")}</Text>
              </Pressable>
              {!online ? <Text className="text-center text-[12px] text-muted">{t("upload.offline")}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* a problem with the file picked on the idle screen (couldn't read it, no permission…) */}
      {phase === "idle" && problem ? <Text className="text-[12.5px] text-crimson">{problem}</Text> : null}

      {/* live progress */}
      {uploading || phase === "preview" || phase === "saving" ? (
        <View className="rounded-lg border border-border bg-surface p-4">
          <View className="flex-row items-end justify-between">
            <Text className="font-display text-[26px] font-semibold text-text" style={{ fontVariant: ["tabular-nums"] }}>
              {uploading ? `${pct}%` : "100%"}
            </Text>
            {uploading ? (
              <Pressable onPress={cancel} hitSlop={8} className="flex-row items-center gap-1.5 pb-1">
                <Icon as={X} size={14} tone="muted" />
                <Text className="text-[12.5px] font-semibold text-muted">{t("wiz.video.cancel")}</Text>
              </Pressable>
            ) : null}
          </View>
          <View className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-raised">
            <View className="h-full rounded-full bg-pink" style={{ width: `${uploading ? pct : 100}%` }} />
          </View>
          <Text className="mt-2.5 text-[12.5px] text-text">
            {uploading ? phaseText : phase === "preview" ? t("wiz.video.building", { pct: Math.round(previewPct * 100) }) : t("wiz.video.saving")}
          </Text>
          {uploading && snap ? (
            <Text className="mt-0.5 text-[12px] text-muted" style={{ fontVariant: ["tabular-nums"] }}>
              {t("wiz.video.sentOf", { sent: formatBytes(snap.sent), total: formatBytes(snap.total) })}
              {snap.bytesPerSecond > 0 && update?.phase !== "retrying"
                ? `  ·  ${t("wiz.video.speedEta", { speed: formatSpeed(snap.bytesPerSecond), eta: formatEta(snap.secondsLeft) ?? "…" })}`
                : ""}
            </Text>
          ) : null}
          <Text className="mt-2.5 text-[11.5px] leading-relaxed text-muted">{t("wiz.video.keepOpen")}</Text>
        </View>
      ) : null}

      {/* failure — in the card, with the action that fixes it */}
      {phase === "error" && error ? (
        <View className="rounded-lg border border-crimson bg-crimson-soft p-3.5">
          <View className="flex-row items-start gap-2.5">
            <TriangleAlert size={18} color={colors.crimson} />
            <View className="min-w-0 flex-1">
              <Text className="text-[13.5px] font-semibold text-crimson">{t("wiz.video.failed")}</Text>
              <Text className="mt-1 text-[12.5px] leading-snug text-crimson">{error.message}</Text>
            </View>
          </View>
          <View className="mt-3 flex-row items-center gap-4">
            <Button size="sm" onPress={start} disabled={!picked}>
              <Icon as={RotateCw} size={13} tone="white" />
              {t("wiz.video.retry")}
            </Button>
            {error.detail ? (
              <Pressable onPress={() => setShowDetail((v) => !v)} hitSlop={8}>
                <Text className="text-[12.5px] font-semibold text-crimson">{showDetail ? t("wiz.video.hideDetails") : t("wiz.video.showDetails")}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={reset} hitSlop={8}>
              <Text className="text-[12.5px] font-semibold text-crimson">{t("wiz.video.chooseOther")}</Text>
            </Pressable>
          </View>
          {showDetail && error.detail ? <Text selectable className="mt-2.5 text-[11px] text-crimson">{error.detail}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
