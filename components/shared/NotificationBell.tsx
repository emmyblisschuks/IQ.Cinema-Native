import { Pressable, View } from "react-native";
import { Bell } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Icon } from "@/components/ui/Icon";
import { Text } from "@/components/ui/Text";
import { useI18n } from "@/hooks/useI18n";
import { useNotifications } from "@/hooks/useNotifications";

// `onVideo` = sits over a dark video (white icon) instead of the app theme.
export function NotificationBell({ onVideo = false }: { onVideo?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { unread } = useNotifications();

  return (
    <Pressable onPress={() => router.push("/notifications")} accessibilityLabel={t("notifications.bell")} hitSlop={8}>
      <View className="relative p-1">
        {onVideo ? <Bell size={22} color="#fff" /> : <Icon as={Bell} size={22} tone="text" />}
        {unread > 0 ? (
          <View className="absolute -right-0.5 -top-0.5 h-4 min-w-[16px] items-center justify-center rounded-full bg-crimson px-1">
            <Text className="text-[9px] font-bold leading-none text-white">{unread > 9 ? "9+" : unread}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
