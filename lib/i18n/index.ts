// lib/i18n/index.ts — native i18n layer. Dictionaries are shared verbatim with
// the web app (lib/i18n/messages.ts); a language without a dictionary, or a
// key missing from one, falls back to English key by key.

import { dictionaries, en, type MessageKey } from "./messages";
import { nativeMessages } from "./native";

export { dictionaries, en };
export type { MessageKey };
export const LANGUAGES = Object.keys(dictionaries);

export function t(lang: string, key: string, vars?: Record<string, string | number>): string {
  const dict = (dictionaries[lang] ?? en) as Record<string, string>;
  let str =
    nativeMessages[lang]?.[key] ??
    dict[key] ??
    nativeMessages.en[key] ??
    (en as Record<string, string>)[key] ??
    key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.split(`{${k}}`).join(String(v));
  }
  return str;
}
