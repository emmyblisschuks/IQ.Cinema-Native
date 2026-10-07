import { createContext, useContext, useMemo, type ReactNode } from "react";
import { dictionaries, hasKey, slugKey, t as tFn } from "@/lib/i18n";

type Ctx = {
  lang: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  // Translate a key if it exists, else show the fallback (DB-provided text).
  tr: (key: string, fallback: string) => string;
  genre: (name: string) => string;
};
const I18nContext = createContext<Ctx>({ lang: "en", t: (k) => k, tr: (_k, f) => f, genre: (n) => n });

export function I18nProvider({ lang = "en", children }: { lang?: string; children: ReactNode }) {
  const resolved = dictionaries[lang] ? lang : "en";
  const value = useMemo<Ctx>(
    () => ({
      lang: resolved,
      t: (key, vars) => tFn(resolved, key, vars),
      tr: (key, fallback) => (hasKey(resolved, key) ? tFn(resolved, key) : fallback),
      genre: (name) => {
        const k = `genre.${slugKey(name)}`;
        return hasKey(resolved, k) ? tFn(resolved, k) : name;
      },
    }),
    [resolved]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
