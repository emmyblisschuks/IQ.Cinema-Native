import type { SupabaseClient } from "@supabase/supabase-js";

// A storyboard is ONE small JPEG containing a grid of low-res frames from an
// episode. The player draws scrub-preview frames out of it, so scrubbing never
// has to touch the video file (no extra range requests, no extra decoders).
// It is generated once — at upload time, from the creator's local file — and
// stored next to the video's path in the public `thumbnails` bucket.
//
// The grid layout and paths here are byte-for-byte the same contract as the
// web app, so storyboards made by either client work in both.

export const STORYBOARD_BUCKET = "thumbnails";
export const SB_FRAME_W = 135; // 1.5x the 90x160 on-screen preview, for sharp phones
export const SB_FRAME_H = 240;
const MAX_FRAMES = 50;
const MAX_COLS = 10;

// Layout is derived from the whole-second duration so the generator (which
// only knows the file) and the player (which only knows the video) always
// agree without storing any extra metadata.
export function storyboardLayout(durationSeconds: number) {
  const duration = Math.max(1, Math.round(durationSeconds));
  const interval = Math.max(2, duration / MAX_FRAMES);
  const count = Math.max(1, Math.floor(duration / interval) + 1);
  const cols = Math.min(MAX_COLS, count);
  const rows = Math.ceil(count / cols);
  return { duration, interval, count, cols, rows, frameW: SB_FRAME_W, frameH: SB_FRAME_H };
}

// videos/<uid>/<title>/<uuid>.mp4  ->  thumbnails/<uid>/<title>/<uuid>.jpg
export function storyboardPath(videoPath: string) {
  return videoPath.replace(/\.[^./]+$/, "") + ".jpg";
}

export function storyboardPublicUrl(supabase: SupabaseClient, videoPath: string) {
  return supabase.storage.from(STORYBOARD_BUCKET).getPublicUrl(storyboardPath(videoPath)).data.publicUrl;
}

export async function uploadStoryboard(
  supabase: SupabaseClient,
  videoPath: string,
  body: ArrayBuffer | Blob
) {
  const { error } = await supabase.storage.from(STORYBOARD_BUCKET).upload(storyboardPath(videoPath), body, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "86400",
  });
  if (error) throw error;
}

// NOTE: generateStoryboard() is intentionally not in this file. The web app
// draws frames into an HTML <canvas>; native has no canvas, so frame
// extraction + JPEG stitching lives in lib/storyboardNative.ts (used by the
// creator upload screen).
