// app/wallet.tsx

import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Zap, ArrowLeft } from "lucide-react-native";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { CoinPackCard, type CoinPack } from "@/components/wallet/CoinPackCard";
import { SubscriptionCard, type SubscriptionPlan } from "@/components/wallet/SubscriptionCard";
import { initializePaystackPurchase, redirectToPaystackCheckout } from "@/lib/paystack";
import { Skeleton } from "@/components/ui/Skeleton";
import { FadeIn } from "@/components/ui/FadeIn";
import { Pop } from "@/components/ui/Pop";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";

export default function WalletPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { wallet, loading: walletLoading } = useWallet(user?.id);
  const { display: balanceDisplay, changed: balanceChanged } = useAnimatedNumber(wallet?.coin_balance);
  const [packs, setPacks] = useState<CoinPack[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("coin_packs")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setPacks((data as CoinPack[]) ?? []));

    supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setPlans((data as SubscriptionPlan[]) ?? []));
  }, []);

  async function handleBuy(type: "coins" | "subscription", id: string) {
    if (!user) {
      setError("Sign in to continue.");
      return;
    }
    setError(null);
    setBuyingId(id);
    try {
      const { authorization_url } = await initializePaystackPurchase(type, id);
      // Opens Paystack in the in-app browser; resolves when it's closed. The
      // wallet balance updates itself over realtime once the webhook lands.
      await redirectToPaystackCheckout(authorization_url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuyingId(null);
    }
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false}>
        <FadeIn style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => router.navigate("/")} accessibilityLabel="Back" hitSlop={10}>
              <Icon as={ArrowLeft} size={20} tone="text" />
            </Pressable>
            <Text className="font-display text-2xl font-semibold text-text">Wallet</Text>
          </View>

          <View className="mt-4 items-center rounded-lg border border-border bg-surface p-4">
            <Text className="text-[12px] text-muted">Coin balance</Text>
            {walletLoading ? (
              <Skeleton className="mt-2 h-8 w-24" />
            ) : (
              <Pop active={balanceChanged}>
                <View className="mt-1 flex-row items-center justify-center gap-1.5">
                  <Icon as={Zap} size={22} tone="gold" fillTone="gold" />
                  <Text className="font-display text-3xl font-semibold text-text" style={{ fontVariant: ["tabular-nums"] }}>
                    {balanceDisplay.toLocaleString()}
                  </Text>
                </View>
              </Pop>
            )}
          </View>

          {error ? (
            <View className="mt-3 rounded-md bg-crimson-soft px-3 py-2">
              <Text className="text-[13px] text-crimson">{error}</Text>
            </View>
          ) : null}

          <View className="mt-6">
            <Text className="font-display mb-2.5 text-[17px] font-semibold text-text">Buy coins</Text>
            <View className="gap-2">
              {packs.map((pack) => (
                <CoinPackCard key={pack.id} pack={pack} loading={buyingId === pack.id} onBuy={(id) => handleBuy("coins", id)} />
              ))}
              {!packs.length ? (
                <>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </>
              ) : null}
            </View>
          </View>

          <View className="mt-7 pb-8">
            <Text className="font-display mb-2.5 text-[17px] font-semibold text-text">Subscribe</Text>
            <View className="gap-3">
              {plans.map((plan) => (
                <SubscriptionCard
                  key={plan.id}
                  plan={plan}
                  highlighted={plan.interval === "monthly"}
                  loading={buyingId === plan.id}
                  onSubscribe={(id) => handleBuy("subscription", id)}
                />
              ))}
            </View>
          </View>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
