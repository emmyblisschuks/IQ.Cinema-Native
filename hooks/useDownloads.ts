// hooks/useDownloads.ts
import { useCallback, useEffect, useState } from "react";
import { listDownloads, subscribe, type DownloadRow } from "@/lib/offline";

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

  return { rows, loading };
}
