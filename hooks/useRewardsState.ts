import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import type { RewardsState } from "@/lib/rewards";

export { type RewardsState };

const supabase = createClient();

export function useRewardsState() {
  const [state, setState] = useState<RewardsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rid = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++rid.current;
    const { data, error: rpcError } = await supabase.rpc("get_rewards_state");
    if (id !== rid.current) return;
    if (rpcError) { setError(rpcError.message); return; }
    setState(data as RewardsState);
    setError(null);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh(); });
    return () => sub.remove();
  }, [refresh]);

  return { state, error, refresh, setError };
}
