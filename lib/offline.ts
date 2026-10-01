// lib/offline.ts  (offline downloads, tracked in SQLite)
import * as SQLite from "expo-sqlite";
import * as FS from "expo-file-system/legacy";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DownloadStatus = "downloading" | "done" | "error";
export type DownloadRow = {
  episode_id: string;
  title_id: string | null;
  title: string;
  episode_number: number;
  video_path: string;
  status: DownloadStatus;
  progress: number;
  bytes: number;
  created_at: number;
};
export type DownloadInput = Pick<
  DownloadRow,
  "episode_id" | "title_id" | "title" | "episode_number" | "video_path"
>;

const DIR = `${FS.documentDirectory}downloads/`;
const fileFor = (id: string) => `${DIR}${id}.mp4`;

const live = new Map<string, number>();
const tasks = new Map<string, ReturnType<typeof FS.createDownloadResumable>>();
const listeners = new Set<() => void>();
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let lastEmit = 0;

function emit(force = false) {
  const now = Date.now();
  if (!force && now - lastEmit < 400) return;
  lastEmit = now;
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function db() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync("iqcinema.db");
      await d.execAsync(`
        CREATE TABLE IF NOT EXISTS downloads (
          episode_id TEXT PRIMARY KEY NOT NULL,
          title_id TEXT,
          title TEXT NOT NULL,
          episode_number INTEGER NOT NULL,
          video_path TEXT NOT NULL,
          status TEXT NOT NULL,
          progress REAL NOT NULL DEFAULT 0,
          bytes INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        UPDATE downloads SET status = 'error' WHERE status = 'downloading';
      `);
      await FS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
      return d;
    })();
  }
  return dbPromise;
}

export async function listDownloads(): Promise<DownloadRow[]> {
  const d = await db();
  const rows = await d.getAllAsync<DownloadRow>(
    "SELECT * FROM downloads ORDER BY created_at DESC"
  );
  return rows.map((r) =>
    r.status === "downloading"
      ? { ...r, progress: live.get(r.episode_id) ?? r.progress }
      : r
  );
}

export async function getLocalUri(episodeId: string): Promise<string | null> {
  const d = await db();
  const r = await d.getFirstAsync<{ status: string }>(
    "SELECT status FROM downloads WHERE episode_id = ? AND status = 'done'",
    [episodeId]
  );
  if (!r) return null;
  const info = await FS.getInfoAsync(fileFor(episodeId));
  return info.exists ? fileFor(episodeId) : null;
}

export async function startDownload(supabase: SupabaseClient, ep: DownloadInput) {
  const d = await db();
  if (tasks.has(ep.episode_id)) return;
  if (await getLocalUri(ep.episode_id)) return;

  await d.runAsync(
    "INSERT OR REPLACE INTO downloads (episode_id, title_id, title, episode_number, video_path, status, progress, bytes, created_at) VALUES (?, ?, ?, ?, ?, 'downloading', 0, 0, ?)",
    [ep.episode_id, ep.title_id, ep.title, ep.episode_number, ep.video_path, Date.now()]
  );
  live.set(ep.episode_id, 0);
  emit(true);

  try {
    const { data, error } = await supabase.storage
      .from("videos")
      .createSignedUrl(ep.video_path, 60 * 60);
    if (error || !data?.signedUrl) throw error ?? new Error("Could not prepare download");

    const dest = fileFor(ep.episode_id);
    const task = FS.createDownloadResumable(data.signedUrl, dest, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        live.set(ep.episode_id, p.totalBytesWritten / p.totalBytesExpectedToWrite);
        emit();
      }
    });
    tasks.set(ep.episode_id, task);

    const res = await task.downloadAsync();
    if (!res || res.status < 200 || res.status >= 300) throw new Error("Download failed");

    const info = await FS.getInfoAsync(dest);
    const bytes = info.exists && "size" in info ? Number(info.size) : 0;
    await d.runAsync(
      "UPDATE downloads SET status = 'done', progress = 1, bytes = ? WHERE episode_id = ?",
      [bytes, ep.episode_id]
    );
  } catch {
    await d
      .runAsync("UPDATE downloads SET status = 'error' WHERE episode_id = ?", [ep.episode_id])
      .catch(() => {});
    await FS.deleteAsync(fileFor(ep.episode_id), { idempotent: true }).catch(() => {});
  } finally {
    tasks.delete(ep.episode_id);
    live.delete(ep.episode_id);
    emit(true);
  }
}

export async function removeDownload(episodeId: string) {
  const d = await db();
  await tasks.get(episodeId)?.cancelAsync().catch(() => {});
  await FS.deleteAsync(fileFor(episodeId), { idempotent: true }).catch(() => {});
  await d.runAsync("DELETE FROM downloads WHERE episode_id = ?", [episodeId]);
  emit(true);
}
