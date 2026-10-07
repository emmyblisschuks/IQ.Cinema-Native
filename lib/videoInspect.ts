// lib/videoInspect.ts — what we know about a picked video before uploading.
import { readMp4Info } from "@/lib/mp4Info";

export type PickedVideo = {
  uri: string;
  duration: number; // seconds
  width: number;
  height: number;
  size: number; // bytes
  fastStart: boolean | null;
};

export const ASPECT_TARGET = 9 / 16;
export const ASPECT_TOLERANCE = 0.02; // same tolerance as the database trigger

// Reads the real values from the file's own MP4 boxes (never trusting a
// picker's metadata alone); falls back to the picker's numbers if the file's
// layout is unusual. Returns null if nothing usable can be determined.
export async function inspectVideo(
  uri: string,
  pickerMeta?: { duration?: number | null; width?: number; height?: number }
): Promise<PickedVideo | null> {
  const info = await readMp4Info(uri);
  const duration = info.duration ?? (pickerMeta?.duration ? pickerMeta.duration / 1000 : 0);
  const width = info.width ?? pickerMeta?.width ?? 0;
  const height = info.height ?? pickerMeta?.height ?? 0;
  if (!duration || !width || !height || !info.size) return null;
  return { uri, duration, width, height, size: info.size, fastStart: info.fastStart };
}

export const isPortrait916 = (w: number, h: number) => h > 0 && Math.abs(w / h - ASPECT_TARGET) <= ASPECT_TOLERANCE;

export function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m ${sec}s` : `${m}m ${sec}s`;
}
