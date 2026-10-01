import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UserSettings = {
  language: string;
  autoplay_next: boolean;
  notify_new_episodes: boolean;
  notify_rewards: boolean;
  notify_promos: boolean;
  whatsapp_number: string | null;
};

type SettingsPatch = Partial<Omit<UserSettings, "whatsapp_number">>;

const DEFAULT: UserSettings = {
  language: "en",
  autoplay_next: true,
  notify_new_episodes: true,
  notify_rewards: true,
  notify_promos: false,
  whatsapp_number: null,
};

const COLS = "language, autoplay_next, notify_new_episodes, notify_rewards, notify_promos, whatsapp_number";
const LANG_KEY = "iq-lang";

type Ctx = { settings: UserSettings; loaded: boolean; error: string | null; update: (p: SettingsPatch) => Promise<boolean>; reload: () => Promise<void> };
const Ctx = createContext<Ctx | undefined>(undefined);
const supabase = createClient();

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(settings);
  ref.current = settings;

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then((v) => { if (v) setSettings((s) => ({ ...s, language: v })); }).catch(() => {});
  }, []);

  const reload = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("user_settings").select(COLS).eq("user_id", user.id).maybeSingle();
    if (data) {
      setSettings({ ...DEFAULT, ...(data as UserSettings) });
      AsyncStorage.setItem(LANG_KEY, (data as UserSettings).language).catch(() => {});
    }
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoaded(true); return; }
    setLoaded(false);
    reload();
  }, [user, authLoading, reload]);

  const update = useCallback(async (patch: SettingsPatch) => {
    const prev = ref.current;
    setSettings({ ...prev, ...patch });
    setError(null);
    if (patch.language) AsyncStorage.setItem(LANG_KEY, patch.language).catch(() => {});
    if (!user) return true;
    const { error: dbError } = await supabase.from("user_settings").upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
    if (dbError) { setSettings(prev); setError(dbError.message); return false; }
    return true;
  }, [user]);

  const value = useMemo(() => ({ settings, loaded, error, update, reload }), [settings, loaded, error, update, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUserSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUserSettings must be inside <UserSettingsProvider>");
  return ctx;
}
