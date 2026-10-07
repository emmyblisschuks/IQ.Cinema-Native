// lib/contentTypes.ts
//
// Everything the upload wizard needs to know about each kind of content.
// Keep `value` in sync with the `content_type` enum and the duration limits in
// public.max_duration_seconds_for() in the database.

import type { Category } from "@/lib/categories";

export type ContentType = "short_episode" | "full_episode" | "one_part_film" | "music_video" | "commercial";
export type Unit = "episode" | "part";

export type ContentKind = {
  value: ContentType;
  nameKey: string; // "Short series"
  descKey: string; // one-line explanation
  emoji: string;
  unit: Unit; // multi-episode series use "episode"; single videos use "part"
  multi: boolean; // can have several episodes
  maxSeconds: number;
  maxLabel: string;
  fixedCategory?: Category; // music videos / commercials have their own collection
  creditLabelKey?: string; // "Artist" / "Brand"
};

export const CONTENT_KINDS: ContentKind[] = [
  { value: "short_episode", nameKey: "kind.short_episode.name", descKey: "kind.short_episode.desc", emoji: "⚡", unit: "episode", multi: true, maxSeconds: 160, maxLabel: "2m 40s" },
  { value: "full_episode", nameKey: "kind.full_episode.name", descKey: "kind.full_episode.desc", emoji: "📺", unit: "episode", multi: true, maxSeconds: 1200, maxLabel: "20m" },
  { value: "one_part_film", nameKey: "kind.one_part_film.name", descKey: "kind.one_part_film.desc", emoji: "🎬", unit: "part", multi: false, maxSeconds: 7200, maxLabel: "120m" },
  { value: "music_video", nameKey: "kind.music_video.name", descKey: "kind.music_video.desc", emoji: "🎵", unit: "part", multi: false, maxSeconds: 600, maxLabel: "10m", fixedCategory: "music", creditLabelKey: "wiz.credit.artist" },
  { value: "commercial", nameKey: "kind.commercial.name", descKey: "kind.commercial.desc", emoji: "📣", unit: "part", multi: false, maxSeconds: 180, maxLabel: "3m", fixedCategory: "commercial", creditLabelKey: "wiz.credit.brand" },
];

export const kindOf = (v: string | null | undefined): ContentKind =>
  CONTENT_KINDS.find((k) => k.value === v) ?? CONTENT_KINDS[1];
