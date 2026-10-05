// lib/reportPlay.ts
import { createClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/device";

const supabase = createClient();

// Mirrors the web app's reportPlay: record_play(p_user_id, p_device_id,
// p_episode_id, p_watched_seconds) validates and rate-limits server-side.
export async function reportPlay(userId: string | null, episodeId: string, watchedSeconds: number) {
  const deviceId = await getDeviceId();
  const { data, error } = await supabase.rpc("record_play", {
    p_user_id: userId,
    p_device_id: deviceId || null,
    p_episode_id: episodeId,
    p_watched_seconds: Math.max(0, Math.floor(watchedSeconds)),
  });
  if (error) console.warn("record_play failed", error.message);
  else if (data && data.ok === false) console.warn("record_play rejected", data.error);
}
