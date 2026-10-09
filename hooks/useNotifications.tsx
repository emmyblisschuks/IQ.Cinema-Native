// hooks/useNotifications.tsx
//
// One source of truth for the unread count. Every bell and the notifications
// screen read from here, so the dot appears the moment a row is inserted and
// clears the moment it's read — on any screen, with no per-bell state.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const supabase = createClient();

type Ctx = {
  unread: number;
  // Bumps on every insert/update so lists can reload themselves.
  version: number;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<Ctx>({
  unread: 0,
  version: 0,
  refresh: async () => {},
  markAllRead: async () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [version, setVersion] = useState(0);
  const userId = user?.id ?? null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const refresh = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) {
      setUnread(0);
      return;
    }
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("read", false);
    if (userIdRef.current !== uid) return;
    if (!error) setUnread(count ?? 0);
  }, []);

  const markAllRead = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    setUnread(0);
    await supabase.from("notifications").update({ read: true }).eq("user_id", uid).eq("read", false);
    setVersion((v) => v + 1);
  }, []);

  // Initial count + live changes.
  useEffect(() => {
    if (!userId) {
      setUnread(0);
      return;
    }
    refresh();
    const channel = supabase
      .channel(`notif-count-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        setVersion((v) => v + 1);
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // Realtime can drop while the app is backgrounded: re-count on resume.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        refresh();
        setVersion((v) => v + 1);
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo(() => ({ unread, version, refresh, markAllRead }), [unread, version, refresh, markAllRead]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
