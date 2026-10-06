import { Pressable, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { WifiOff } from "lucide-react-native";
import { Text } from "@/components/ui/Text";
import { useI18n } from "@/hooks/useI18n";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTheme } from "@/hooks/useTheme";

// Screens that work without a connection (downloads are on-device).
const OFFLINE_OK = ["/downloads"];

// A quiet strip above the tab bar when the device can't reach the backend:
// says so, and points to the things that still work offline.
export function OfflineBanner() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { online, checking, recheck } = useOnlineStatus();

  if (online) return null;
  if (OFFLINE_OK.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      className="w-full flex-row items-center gap-2.5 border-t border-border bg-surface-raised px-3.5 py-2.5"
    >
      <WifiOff size={16} color={colors.muted} />
      <View className="min-w-0 flex-1">
        <Text className="text-[12.5px] font-semibold text-text">{t("offline.title")}</Text>
        <Text className="text-[11.5px] leading-snug text-muted">{t("offline.body")}</Text>
      </View>
      <Pressable onPress={() => router.push("/downloads" as never)} hitSlop={6}>
        <Text className="text-[12.5px] font-semibold text-pink">{t("offline.downloads")}</Text>
      </Pressable>
      <Pressable onPress={() => void recheck()} disabled={checking} hitSlop={6}>
        <Text className="text-[12.5px] font-semibold text-muted">{checking ? t("offline.checking") : t("offline.retry")}</Text>
      </Pressable>
    </View>
  );
}
