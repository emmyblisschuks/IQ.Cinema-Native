// lib/push.ts
// Native notification permission + local display helpers (expo-notifications).
// user_settings.push_permission is kept in sync with the OS's real state by
// <NotificationListener/>; the OS never re-prompts after "Don't allow", so for
// that case the UI tells the user to enable it in system settings.

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushState = "granted" | "denied" | "default" | "unsupported";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function getPushState(): Promise<PushState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return "granted";
    return p.canAskAgain ? "default" : "denied";
  } catch {
    return "unsupported";
  }
}

// Asks the OS, persists the answer, and (if granted) tries the one-time
// "Turn on notification permission" reward. Used by Settings and Rewards.
export async function enablePush(supabase: SupabaseClient, userId: string): Promise<PushState> {
  if ((await getPushState()) === "unsupported") return "unsupported";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "General",
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
  const res = await Notifications.requestPermissionsAsync();
  const permission: PushState = res.granted ? "granted" : res.canAskAgain ? "default" : "denied";
  await supabase.from("user_settings").upsert({ user_id: userId, push_permission: permission }, { onConflict: "user_id" });
  if (permission === "granted") {
    await supabase.rpc("claim_reward_task", { p_task_key: "enable_notifications" });
  }
  return permission;
}

export async function showLocalNotification(opts: { id: string; title: string; body?: string | null; href?: string }) {
  if ((await getPushState()) !== "granted") return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: opts.id,
      content: { title: opts.title, body: opts.body ?? undefined, data: { href: opts.href ?? "/notifications" } },
      trigger: null,
    });
  } catch {
    // Display is best-effort; the in-app notification centre still has it.
  }
}
