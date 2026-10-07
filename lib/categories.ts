// lib/categories.ts

// Mirrors the CHECK constraint on public.titles.category.
export const CATEGORIES = [
  { value: "drama", label: "Drama", labelKey: "category.drama" },
  { value: "story", label: "Story", labelKey: "category.story" },
  { value: "anime", label: "Anime", labelKey: "category.anime" },
  { value: "music", label: "Music", labelKey: "category.music" },
  { value: "commercial", label: "Ads", labelKey: "category.commercial" },
] as const;

// Story categories a creator picks from for a series or film. Music videos
// and commercials get their own category automatically.
export const STORY_CATEGORIES = CATEGORIES.filter((c) => c.value === "drama" || c.value === "story" || c.value === "anime");

export type Category = (typeof CATEGORIES)[number]["value"];

export const DEFAULT_CATEGORY: Category = "drama";
