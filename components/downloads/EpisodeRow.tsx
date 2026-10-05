import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Play, RotateCw } from "lucide-react-native";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { SelectDot } from "@/components/library/SelectDot";
import { BrandGradient } from "@/components/ui/BrandGradient";
import { ProgressRing } from "@/components/downloads/ProgressRing";
import { useI18n } from "@/hooks/useI18n";
import type { DownloadRow } from "@/lib/offline";

function statusLine(r: DownloadRow, t: (k: string, v?: Record<string, string | number>) => string) {
  switch (r.status) {
    case "done":
      return r.bytes ? `${t("downloads.readyToWatch")} · ${sizeLabel(r.bytes)}` : t("downloads.readyToWatch");
    case "downloading":
      return t("watch.downloadingPct", { pct: Math.floor(r.progress * 100) });
    case "error":
      return t("watch.downloadFailed");
  }
}

function sizeLabel(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

// One downloaded (or downloading) episode inside a movie folder.
export function EpisodeRow({
  row,
  poster,
  editing,
  selected,
  onToggleSelect,
  onPlay,
  onRetry,
}: {
  row: DownloadRow;
  poster: string | null;
  editing: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onPlay: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const complete = row.status === "done";

  const content = (
    <View className="min-w-0 flex-1 flex-row gap-3.5">
      <View className="overflow-hidden rounded-lg bg-surface-raised" style={{ width: 72, aspectRatio: 3 / 4 }}>
        {poster ? <Image source={{ uri: poster }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}
        <View className="absolute bottom-1 left-1 rounded-md px-1.5 py-0.5" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
          <Text className="text-[11px] font-bold text-white">{t("common.epShort", { n: row.episode_number })}</Text>
        </View>
      </View>
      <View className="min-w-0 flex-1 py-1">
        <Text numberOfLines={1} className="text-[16px] font-semibold text-text">{t("common.episodeN", { n: row.episode_number })}</Text>
        <Text className={row.status === "error" ? "mt-1 text-[13px] text-crimson" : "mt-1 text-[13px] text-muted"}>{statusLine(row, t)}</Text>
      </View>
    </View>
  );

  return (
    <View className="flex-row items-center gap-3">
      {editing ? <SelectDot selected={selected} variant="plain" /> : null}

      <Pressable
        onPress={editing ? onToggleSelect : complete ? onPlay : undefined}
        accessibilityState={{ selected }}
        className="min-w-0 flex-1 flex-row"
      >
        {content}
      </Pressable>

      {editing ? null : complete ? (
        <Pressable onPress={onPlay} accessibilityLabel={t("common.play")} className="h-10 w-10 items-center justify-center overflow-hidden rounded-full">
          <BrandGradient radius={20} />
          <Icon as={Play} size={16} tone="white" fillTone="white" />
        </Pressable>
      ) : row.status === "error" ? (
        <Pressable onPress={onRetry} accessibilityLabel={t("watch.retryDownload")}>
          <ProgressRing progress={0} size={40}>
            <Icon as={RotateCw} size={14} tone="text" />
          </ProgressRing>
        </Pressable>
      ) : (
        <ProgressRing progress={row.progress} size={40} />
      )}
    </View>
  );
}
