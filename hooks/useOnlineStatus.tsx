// hooks/useOnlineStatus.tsx
//
// Whether the device can actually reach the backend (not just "has a radio
// connected"). JS-only on purpose: it works on every installed build. When the
// optional NetInfo native module is present it is used as an instant hint;
// either way a real request to the backend decides.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/client";

type NetInfoModule = typeof import("@react-native-community/netinfo");
let NetInfo: NetInfoModule["default"] | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NetInfo = (require("@react-native-community/netinfo") as NetInfoModule).default ?? null;
} catch {
  NetInfo = null;
}

type Ctx = { online: boolean; checking: boolean; recheck: () => Promise<boolean> };
const OnlineContext = createContext<Ctx>({ online: true, checking: false, recheck: async () => true });

async function canReachBackend(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    // Any HTTP response (even 401/404) proves the network path works.
    await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: ctrl.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function OnlineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const onlineRef = useRef(true);
  const inFlight = useRef<Promise<boolean> | null>(null);

  const recheck = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    setChecking(true);
    const p = canReachBackend().then((ok) => {
      onlineRef.current = ok;
      setOnline(ok);
      setChecking(false);
      inFlight.current = null;
      return ok;
    });
    inFlight.current = p;
    return p;
  }, []);

  useEffect(() => {
    void recheck();

    // Poll slowly while online (catches silent drops), quickly while offline
    // (so the notice clears soon after the connection returns).
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(async () => {
        if (AppState.currentState === "active") await recheck();
        loop();
      }, onlineRef.current ? 30000 : 5000);
    };
    loop();

    const appSub = AppState.addEventListener("change", (s) => s === "active" && void recheck());
    const netUnsub = NetInfo?.addEventListener(() => void recheck());

    return () => {
      clearTimeout(timer);
      appSub.remove();
      netUnsub?.();
    };
  }, [recheck]);

  const value = useMemo(() => ({ online, checking, recheck }), [online, checking, recheck]);
  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

export function useOnlineStatus() {
  return useContext(OnlineContext);
}
