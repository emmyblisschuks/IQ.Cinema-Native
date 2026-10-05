// hooks/useDownloads.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { listDownloads, subscribe, type DownloadRow } from "@/lib/offline";

// One movie folder: every downloaded / downloading episode of a title.
export type DownloadFolder = {
  titleId: string;
  title: string;
  poster: string | null;
  rows: DownloadRow[]; // episode order
  activeCount: number; // still downloading
};

export function useDownloads() {
  const [rows, setRows] = useState<DownloadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setRows(await listDownloads());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribe(() => {
      void refresh();
    });
  }, [refresh]);

  const folders = useMemo<DownloadFolder[]>(() => {
    const map = new Map<string, DownloadFolder>();
    for (const r of rows) {
      const key = r.title_id ?? r.title;
      let f = map.get(key);
      if (!f) {
        f = { titleId: key, title: r.title, poster: r.poster_url ?? null, rows: [], activeCount: 0 };
        map.set(key, f);
      }
      if (!f.poster && r.poster_url) f.poster = r.poster_url;
      f.rows.push(r);
      if (r.status === "downloading") f.activeCount++;
    }
    const list = Array.from(map.values());
    for (const f of list) f.rows.sort((a, b) => a.episode_number - b.episode_number);
    return list;
  }, [rows]);

  return { rows, folders, loading };
}
