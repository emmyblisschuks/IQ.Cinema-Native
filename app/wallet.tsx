// app/wallet.tsx

import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { useStoreState } from "@/hooks/useStoreState";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { CoinPackCard } from "@/components/wallet/CoinPackCard";
import { SubscriptionCard } from "@/components/wallet/SubscriptionCard";
import { initializePaystackPurchase, redirectToPaystackCheckout } from "@/lib/paystack";
import { Skeleton } from "@/components/ui/Skeleton";
import { FadeIn } from "@/components/ui/FadeIn";
import { Pop } from "@/components/ui/Pop";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { BrandGradient } from "@/components/ui/BrandGradient";

const TIP_KEYS = ["wallet.tip1", "wallet.tip2", "wallet.tip3", "wallet.tip4", "wallet.tip5", "wallet.tip6"];

export default function WalletPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { state, error: stateError, refresh } = useStoreState();
  const { display: coinsDisplay, changed: coinsChanged } = useAnimatedNumber(state?.balances.coins);
  const { display: rewardDisplay, changed: rewardChanged } = useAnimatedNumber(state?.balances.reward_coins);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(type: "coins" | "subscription", id: string) {
    if (!user) {
      setError(t("wallet.signInToContinue"));
      return;
    }
    setError(null);
    setBuyingId(id);
    try {
      const { authorization_url } = await initializePaystackPurchase(type, id);
      // In-app browser; resolves when it's closed. Refetch so the new balance
      // or membership shows right away (the webhook may land a moment later).
      await redirectToPaystackCheckout(authorization_url);
      refresh();
      setTimeout(refresh, 4000);
    } catch (e) {
      const msg = (e as Error).message;
      // Our own codes are translated; backend messages are shown as they come.
      setError(msg === "not_signed_in" ? t("wallet.notSignedIn") : msg === "payment_start_failed" ? t("wallet.paymentFailed") : msg);
    } finally {
      setBuyingId(null);
    }
  }

  const loading = !state;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false}>
        <FadeIn style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/profile" as never))} accessibilityLabel={t("common.back")} hitSlop={10}>
              <Icon as={ArrowLeft} size={20} tone="text" />
            </Pressable>
            <Text className="font-display text-2xl font-semibold text-text">{t("wallet.title")}</Text>
          </View>

          <View className="mt-4 flex-row items-stretch rounded-lg border border-border bg-surface p-4">
            {[
              { label: t("wallet.coins"), val: coinsDisplay, changed: coinsChanged },
              { label: t("wallet.rewardCoins"), val: rewardDisplay, changed: rewardChanged },
            ].map((col, i) => (
              <View key={i} className="flex-1 items-center gap-1" style={i === 1 ? { borderLeftWidth: 1, borderLeftColor: "rgba(128,128,128,0.25)" } : undefined}>
                {loading ? (
                  <Skeleton className="h-7 w-14" />
                ) : (
                  <Pop active={col.changed} trigger={col.val}>
                    <Text className="font-display text-[22px] font-semibold text-text" style={{ fontVariant: ["tabular-nums"] }}>
                      {col.val.toLocaleString()}
                    </Text>
                  </Pop>
                )}
                <Text className="text-[12px] text-muted">{col.label}</Text>
              </View>
            ))}
          </View>

          {error || stateError ? (
            <View className="mt-3 rounded-md bg-crimson-soft px-3 py-2">
              <Text className="text-[13px] text-crimson">{error ?? stateError}</Text>
            </View>
          ) : null}

          {!loading && state.membership.active ? (
            <View className="mt-4 overflow-hidden rounded-lg px-4 py-3">
              <BrandGradient radius={12} />
              <Text className="text-[13px] font-semibold" style={{ color: "#fff" }}>👑 {t("wallet.planActive", { plan: state.membership.plan_name ?? "" })}</Text>
              <Text className="mt-0.5 text-[12px]" style={{ color: "rgba(255,255,255,0.85)" }}>
                {t(state.membership.auto_renew ? "wallet.renewsOn" : "wallet.endsOn", {
                  date: new Date(state.membership.ends_at!).toLocaleDateString(lang),
                })}
              </Text>
            </View>
          ) : null}

          <View className="mt-6">
            <Text className="font-display mb-2.5 text-[16px] font-semibold text-text">{t("wallet.coins")}</Text>
            <View className="flex-row flex-wrap gap-2.5">
              {loading
                ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[76px]" style={{ width: "48%" }} />)
                : state.packs.map((pack, i) => (
                    <View key={pack.id} style={{ width: "48.5%" }}>
                      <CoinPackCard pack={pack} highlighted={i === 1} loading={buyingId === pack.id} onBuy={(id) => handleBuy("coins", id)} />
                    </View>
                  ))}
            </View>
          </View>

          <View className="mt-7 pb-4">
            <Text className="font-display mb-2.5 text-[16px] font-semibold text-text">{t("wallet.subscription")}</Text>
            <View className="gap-3">
              {loading
                ? [1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)
                : state.plans.map((plan) => (
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

          <View className="mt-2 pb-6">
            <Text className="font-display mb-2 text-[14px] font-semibold text-text">{t("wallet.tips")}</Text>
            <View className="gap-2">
              {TIP_KEYS.map((key, i) => (
                <Text key={key} className="text-[12.5px] leading-relaxed text-muted">
                  {i + 1}. {t(key)}
                </Text>
              ))}
            </View>
          </View>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
