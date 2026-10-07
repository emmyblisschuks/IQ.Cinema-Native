import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Bell } from "lucide-react-native";
import { useRouter } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/hooks/useI18n";

const supabase = createClient();

export function NotificationBell() {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    let ignore = false;
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false)
      .then(({ count }) => { if (!ignore) setUnread(count ?? 0); });
    const topic = `notif-bell-${user.id}-${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(topic)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => setUnread((n) => n + 1))
      .subscribe();
    return () => { ignore = true; supabase.removeChannel(ch); };
  }, [user]);

  return (
    <Pressable onPress={() => router.push("/notifications")} accessibilityLabel={t("notifications.bell")} hitSlop={8}>
      <View className="relative p-1">
        <Icon as={Bell} size={22} tone="text" />
        {unread > 0 && (
          <View className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-crimson ring-2 ring-bg" />
        )}
      </View>
    </Pressable>
  );
}
