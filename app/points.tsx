import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowLeft, Gem, Gift, Lock } from "lucide-react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useI18n } from "@/hooks/useI18n";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { Pop } from "@/components/ui/Pop";
import { FadeIn } from "@/components/ui/FadeIn";
import clsx from "clsx";

const supabase = createClient();

type PointsItem = { id: string; kind: string; name: string; description: string|null; cost_points: number };
type PointsState = { signed_in: boolean; vip: boolean; points: number; box: { opened_today: boolean; points_today: number|null; vip_only: boolean; min: number; max: number }; items: PointsItem[]; redemptions: { id: string; item_name: string; cost_points: number }[] };

export default function PointsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<PointsState|null>(null);
  const [cracking, setCracking] = useState(false);
  const [crackResult, setCrackResult] = useState<number|null>(null);
  const [redeemingId, setRedeemingId] = useState<string|null>(null);
  const [error, setError] = useState<string|null>(null);

  const refresh = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("get_points_state");
    if (e) { setError(e.message); return; }
    setState(data as PointsState);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const { display: pts, changed: ptsChanged } = useAnimatedNumber(state?.points);

  async function crack() {
    setCracking(true); setError(null);
    const { data } = await supabase.rpc("crack_daily_box");
    setCracking(false);
    if (!data?.ok) { setError(data?.error === "vip_required" ? t("points.vipRequiredError") : t("points.alreadyOpened")); }
    else { setCrackResult(data.points); }
    refresh();
  }

  async function redeem(item: PointsItem) {
    setRedeemingId(item.id); setError(null);
    const { data } = await supabase.rpc("redeem_points_item", { p_item_id: item.id });
    setRedeemingId(null);
    if (!data?.ok) { setError(data?.error === "insufficient_points" ? t("points.notEnough") : data?.error === "vip_required" ? t("points.needMembership") : t("points.redeemFailed")); }
    refresh();
  }

  const loading = authLoading || !state;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-4 pt-5 pb-10" showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => router.push("/rewards" as never)} accessibilityLabel={t("common.back")} hitSlop={10}><Icon as={ArrowLeft} size={20} tone="text" /></Pressable>
            <Text className="font-display text-2xl font-semibold text-text">{t("points.title")}</Text>
          </View>

          <View className="mt-4 w-fit flex-row items-center gap-2 self-start rounded-full bg-surface-raised px-3 py-1.5">
            <Icon as={Gem} size={15} tone="pink" />
            {loading ? <Skeleton className="h-4 w-10" /> : (
              <Pop active={ptsChanged} trigger={pts}><Text className="font-display text-[14px] font-semibold text-text" style={{ fontVariant:["tabular-nums"] }}>{pts.toLocaleString()}</Text></Pop>
            )}
          </View>

          {error ? <View className="mt-3 rounded-md bg-crimson-soft px-3 py-2"><Text className="text-[13px] text-crimson">{error}</Text></View> : null}

          <View className="mt-6 items-center rounded-lg border border-border bg-surface px-4 py-7">
            <Pop active={crackResult !== null} style={{ alignSelf:"center" }}>
              <View className="h-20 w-20 items-center justify-center rounded-2xl bg-gold-soft">
                <Text className="text-4xl">{crackResult !== null ? "🎉" : "🎁"}</Text>
              </View>
            </Pop>
            <Text className="font-display mt-3 text-[16px] font-semibold text-text">{crackResult !== null ? t("points.youWon", { n: crackResult }) : t("points.crackTheBox")}</Text>
            {crackResult === null && !loading && <Text className="mt-1 text-[12.5px] text-gold">{t("points.winUpTo", { n: state.box.max })}</Text>}
            {!loading && state.box.vip_only && !state.vip ? (
              <Pressable onPress={() => router.push("/wallet" as never)} className="mt-4 w-full max-w-[220px]">
                <Button variant="gold" className="w-full"><Icon as={Lock} size={14} tone="rgb(20,16,8)" /> {t("points.vipRequired")}</Button>
              </Pressable>
            ) : (
              <Button variant="gold" className="mt-4 w-full max-w-[220px]" disabled={cracking || (state?.box.opened_today ?? true) || loading} onPress={crack}>
                {loading ? "…" : state.box.opened_today ? t("points.openedToday", { n: state.box.points_today ?? 0 }) : cracking ? t("points.opening") : t("points.unlockNow")}
              </Button>
            )}
          </View>

          <View className="mt-7">
            <Text className="font-display mb-2.5 text-[16px] font-semibold text-text">{t("points.redemption")}</Text>
            <View className="gap-2">
              {loading ? [1,2].map((i) => <Skeleton key={i} className="h-16 w-full" />) : state.items.map((item) => {
                const can = state.points >= item.cost_points;
                return (
                  <View key={item.id} className="flex-row items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
                    <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink/10"><Icon as={Gift} size={18} tone="pink" /></View>
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-[14px] font-medium text-text">{item.name}</Text>
                      <View className="mt-0.5 flex-row items-center gap-1"><Icon as={Gem} size={11} tone="pink" /><Text className="text-[12.5px] text-pink">{item.cost_points.toLocaleString()}</Text></View>
                    </View>
                    <Button size="sm" variant="secondary" disabled={!can || redeemingId === item.id} onPress={() => redeem(item)}>{redeemingId===item.id?"…":t("points.redeem")}</Button>
                  </View>
                );
              })}
            </View>
          </View>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
