import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const supabase = createClient();

// Which of these episodes the signed-in viewer has paid to unlock. Episodes
// that are free by count need no entry, so they're not in this set. Shared by
// every surface that opens the episode tray.
export function useUnlockedEpisodeIds(episodeIds: string[], enabled = true) {
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const key = episodeIds.join(",");

  useEffect(() => {
    // Callers that don't need the answer yet pass enabled=false so no
    // request is made on load.
    if (!enabled) return;
    if (!user || !key) {
      setUnlocked(new Set());
      return;
    }
    let ignore = false;
    supabase
      .from("episode_unlocks")
      .select("episode_id")
      .eq("user_id", user.id)
      .in("episode_id", key.split(","))
      .then(({ data }) => {
        if (!ignore) setUnlocked(new Set((data ?? []).map((u) => u.episode_id)));
      });
    return () => {
      ignore = true;
    };
  }, [user?.id, key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return unlocked;
}
