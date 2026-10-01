import { createContext, useContext, useMemo, type ReactNode } from "react";
import { t as tFn } from "@/lib/i18n";

type Ctx = { lang: string; t: (key: string, vars?: Record<string, string | number>) => string };
const I18nContext = createContext<Ctx>({ lang: "en", t: (k) => k });

export function I18nProvider({ lang = "en", children }: { lang?: string; children: ReactNode }) {
  const value = useMemo<Ctx>(
    () => ({ lang, t: (key, vars) => tFn(lang, key, vars) }),
    [lang]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
