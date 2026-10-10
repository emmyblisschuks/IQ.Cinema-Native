// lib/forYouTabs.ts
//
// The three in-page views of the For You feed. Every one is a list of promo
// episodes (episodes.is_promo) — only the ranking differs, and it's done in
// the get_for_you_feed_v2 RPC. (The Collections tab and its category sub-tabs
// were removed to keep the feed simple.)
//   for_you     blended relevance (recency + engagement + your genres)
//   new         newest releases first
//   trending    hottest over the last 7 days

export const FOR_YOU_TABS = [
  { key: "for_you", label: "For you", labelKey: "foryou.tab.forYou" },
  { key: "new", label: "New", labelKey: "foryou.tab.new" },
  { key: "trending", label: "Trending", labelKey: "foryou.tab.trending" },
] as const;

export type ForYouTab = (typeof FOR_YOU_TABS)[number]["key"];

export function parseForYouTab(value: string | null | undefined): ForYouTab {
  return FOR_YOU_TABS.some((t) => t.key === value) ? (value as ForYouTab) : "for_you";
}

// What the RPC's p_tab understands (same names as the tabs).
export function rpcTabFor(tab: ForYouTab): "for_you" | "new" | "trending" {
  return tab;
}

// i18n keys (see lib/i18n/messages.ts) — resolved with t() where rendered.
export const EMPTY_COPY_KEY = {
  for_you: "foryou.empty.forYou",
  new: "foryou.empty.new",
  trending: "foryou.empty.trending",
} as const satisfies Record<ForYouTab, string>;
