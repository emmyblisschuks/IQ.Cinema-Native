import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Wallet = {
  coin_balance: number;
  earnings_balance_naira: number;
  escrow_balance_naira: number;
};

const supabase = createClient();

export function useWallet(userId: string | undefined) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("wallets").select("*").eq("user_id", userId).single();
    setWallet(data as Wallet);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Coin purchases and withdrawals settle server-side via webhooks; this is
  // what lets the balance (and its count-up animation) react the moment it
  // actually changes. Each subscription gets a unique topic because
  // supabase.channel(topic) returns the already-subscribed channel for a
  // reused name, and calling .on() on it throws.
  useEffect(() => {
    if (!userId) return;

    const topic = `wallet-live-${userId}-${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wallets", filter: `user_id=eq.${userId}` },
        (payload) => {
          setWallet((prev) => ({ ...(prev ?? ({} as Wallet)), ...(payload.new as Partial<Wallet>) }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { wallet, loading, refresh };
}
