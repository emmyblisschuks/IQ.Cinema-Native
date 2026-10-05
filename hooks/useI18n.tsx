import { createContext, useContext, useMemo, type ReactNode } from "react";
import { dictionaries, t as tFn } from "@/lib/i18n";

type Ctx = { lang: string; t: (key: string, vars?: Record<string, string | number>) => string };
const I18nContext = createContext<Ctx>({ lang: "en", t: (k) => k });

export function I18nProvider({ lang = "en", children }: { lang?: string; children: ReactNode }) {
  const resolved = dictionaries[lang] ? lang : "en";
  const value = useMemo<Ctx>(
    () => ({ lang: resolved, t: (key, vars) => tFn(resolved, key, vars) }),
    [resolved]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
