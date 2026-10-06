import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme } from "nativewind";
import {
  darkPalette,
  darkTokens,
  lightPalette,
  lightTokens,
  type Palette,
} from "@/lib/theme";

export type ThemeMode = "light" | "dark" | "system";

type ThemeState = {
  mode: ThemeMode;
  setTheme: (next: ThemeMode) => void;
  isDark: boolean;
  colors: Palette;
  tokens: typeof lightTokens | typeof darkTokens;
  ready: boolean;
};

const ThemeContext = createContext<ThemeState | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("iq-theme")
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") setMode(stored);
      })
      .finally(() => setReady(true));
  }, []);

  const isDark = mode === "system" ? system === "dark" : mode === "dark";

  // Keep NativeWind's `dark:` variants and the OS-level appearance in step
  // with the chosen mode. Forcing "light"/"dark" overrides the device
  // appearance for the whole app, and that override sticks until it's
  // released — so choosing "system" must clear it, otherwise the app keeps
  // whichever theme was used last instead of following the device.
  useEffect(() => {
    if (!ready) return;
    if (mode === "system") {
      try {
        Appearance.setColorScheme("unspecified");
      } catch {
        // older runtimes: NativeWind's "system" below still releases it
      }
      colorScheme.set("system");
    } else {
      colorScheme.set(mode);
    }
  }, [mode, ready]);

  const setTheme = useCallback((next: ThemeMode) => {
    setMode(next);
    AsyncStorage.setItem("iq-theme", next).catch(() => {});
  }, []);

  const value = useMemo<ThemeState>(
    () => ({
      mode,
      setTheme,
      isDark,
      colors: isDark ? darkPalette : lightPalette,
      tokens: isDark ? darkTokens : lightTokens,
      ready,
    }),
    [mode, setTheme, isDark, ready]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used within a <ThemeProvider> (see app/_layout.tsx)");
  return ctx;
}
