import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { createClient } from "@/lib/supabase/client";
import type { StoreState } from "@/lib/store";

const supabase = createClient();

// One RPC (get_store) backs the whole Wallet screen: balances, coin packs,
// subscription plans and the viewer's membership.
export function useStoreState() {
  const [state, setState] = useState<StoreState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("get_store");
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setState(data as StoreState);
    setError(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Returning from Paystack's in-app browser / app switcher → refetch so the
  // new balance or membership shows without a manual reload.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);

  return { state, error, refresh };
}
