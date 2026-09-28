// hooks/useAuth.tsx

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  // `role` is only ever the content tier now (partner is layered on top via
  // creator_status). Staff and admin are independent flags — any tier can
  // also be staff and/or admin at the same time.
  role: "viewer" | "creator";
  creator_status: "none" | "applied" | "approved" | "declined" | "ignored" | "partner";
  is_staff: boolean;
  is_admin: boolean;
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const supabase = createClient();

// One provider, mounted once at the root: exactly one auth fetch, one profile
// fetch and one realtime channel per session no matter how many components
// call useAuth() (a second `.on()` on an already-subscribed channel throws).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Bumped on every user change so a slow profile fetch from a superseded
    // user can't land after a newer one and overwrite it.
    let requestId = 0;

    async function loadProfile(userId: string, thisRequest: number) {
      const { data: p, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) console.error("Failed to load profile:", error.message);
      if (mounted && thisRequest === requestId) setProfile(p as Profile);
    }

    // The persisted session lives in AsyncStorage on native, so the first
    // read is local (no network round trip) and works offline.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) {
        requestId += 1;
        loadProfile(u.id, requestId);
      }
      setLoading(false);
    });

    // Covers sign-in/sign-out while mounted (e.g. after a deep-link callback).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      requestId += 1;
      setUser(session?.user ?? null);
      if (session?.user) {
        // Defer: supabase-js warns against awaiting other Supabase calls
        // directly inside this callback.
        const id = requestId;
        setTimeout(() => loadProfile(session.user.id, id), 0);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Keep `profile` live: an admin can change someone's tier/staff/admin flags
  // from another device mid-session, and gated screens must react at once.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-live-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          setProfile((prev) => ({ ...(prev ?? ({} as Profile)), ...(payload.new as Partial<Profile>) }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return <AuthContext.Provider value={{ user, profile, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used within an <AuthProvider> (see app/_layout.tsx)");
  }
  return ctx;
}
