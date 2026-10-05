import { useEffect } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getPushState, showLocalNotification } from "@/lib/push";

const supabase = createClient();

// Mounted once in the root layout. Three jobs:
//  1. Keep user_settings.push_permission equal to the OS's real permission.
//  2. Show new in-app notifications as system notifications while permission
//     is granted (rows are created server-side and already respect the
//     user's notification toggles).
//  3. Open the right screen when a notification is tapped.
export function NotificationListener() {
  const { user } = useAuth();
  const router = useRouter();
  const { settings, loaded, update } = useUserSettings();

  useEffect(() => {
    if (!user || !loaded) return;
    const sync = async () => {
      const state = await getPushState();
      if (state !== "unsupported" && state !== settings.push_permission) update({ push_permission: state });
    };
    sync();
    const sub = AppState.addEventListener("change", (s) => s === "active" && sync());
    return () => sub.remove();
  }, [user, loaded, settings.push_permission, update]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-os-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as { id: string; title: string; body: string | null; metadata: { href?: string } | null };
          showLocalNotification({ id: n.id, title: n.title, body: n.body, href: n.metadata?.href });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const href = r.notification.request.content.data?.href;
      if (typeof href === "string" && href.startsWith("/")) router.push(href as never);
    });
    return () => sub.remove();
  }, [router]);

  return null;
}
