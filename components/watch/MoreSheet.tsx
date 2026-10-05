import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Check, Download, MonitorPlay } from "lucide-react-native";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/hooks/useI18n";

// Every episode is stored as a single rendition today (see video_width /
// video_height on the row) — there's no ladder of bitrates to switch between
// yet. This still gives the viewer an honest quality readout instead of a
// fake picklist; once multiple renditions exist server-side, swap this one
// row for a mapped list and wire onSelect to change the source.
function qualityLabel(height: number | null) {
  if (!height) return "Auto";
  if (height >= 1080) return `${height}p · Full HD`;
  if (height >= 720) return `${height}p · HD`;
  return `${height}p`;
}

export function MoreSheet({
  open,
  onClose,
  videoHeight,
  onDownload,
}: {
  open: boolean;
  onClose: () => void;
  videoHeight: number | null;
  onDownload: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await onDownload();
    } catch {
      setDownloadError("Couldn't start the download. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Playback options">
      <View className="gap-1 px-3 pb-2 pt-1">
        <View className="flex-row items-center justify-between rounded-md px-1.5 py-2.5">
          <View className="flex-row items-center gap-2.5">
            <Icon as={MonitorPlay} size={18} tone="muted" />
            <Text className="text-[14px] font-medium text-text">{t("watch.quality")}</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-[13px] font-semibold text-muted">{qualityLabel(videoHeight)}</Text>
            <Icon as={Check} size={15} tone="pink" />
          </View>
        </View>

        <Pressable
          onPress={handleDownload}
          disabled={downloading}
          className="flex-row items-center justify-between rounded-md px-1.5 py-2.5 active:bg-surface-raised"
          style={{ opacity: downloading ? 0.6 : 1 }}
        >
          <View className="flex-row items-center gap-2.5">
            {downloading ? <ActivityIndicator size="small" color={colors.muted} /> : <Icon as={Download} size={18} tone="muted" />}
            <Text className="text-[14px] font-medium text-text">{downloading ? "Preparing download…" : "Download"}</Text>
          </View>
        </Pressable>
        {downloadError ? <Text className="px-1.5 text-[12px] text-crimson">{downloadError}</Text> : null}
      </View>
    </BottomSheet>
  );
}
