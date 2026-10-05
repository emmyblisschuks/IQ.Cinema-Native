// app/rewards.tsx
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronRight, Gem, Coins } from "lucide-react-native";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { enablePush } from "@/lib/push";
import { useRewardsState } from "@/hooks/useRewardsState";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useI18n } from "@/hooks/useI18n";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { Pop } from "@/components/ui/Pop";
import { BrandGradient } from "@/components/ui/BrandGradient";
import { FadeIn } from "@/components/ui/FadeIn";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { StreakCalendar } from "@/components/rewards/StreakCalendar";
import { DailyOfferCard } from "@/components/rewards/DailyOfferCard";
import { TaskRow } from "@/components/rewards/TaskRow";
import { AdWatchSheet } from "@/components/rewards/AdWatchSheet";
import { WhatsAppLinkSheet } from "@/components/rewards/WhatsAppLinkSheet";
import type { RewardTask } from "@/lib/rewards";

const supabase = createClient();

export default function RewardsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const { state, error, refresh, setError } = useRewardsState();
  const { display: coinsDisplay, changed: coinsChanged } = useAnimatedNumber(state?.balances.coins);
  const { display: rewardDisplay, changed: rewardChanged } = useAnimatedNumber(state?.balances.reward_coins);
  const [checkingIn, setCheckingIn] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [adTaskKey, setAdTaskKey] = useState<string | null>(null);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function requireAuth() { router.push(`/auth/login?next=/rewards` as never); }

  async function handleCheckIn() {
    if (!user) return requireAuth();
    setCheckingIn(true);
    await supabase.rpc("daily_check_in");
    setCheckingIn(false);
    refresh();
  }

  async function handleTask(task: RewardTask) {
    if (!user) return requireAuth();
    if (task.status === "done" || busyTask) return;
    if (task.kind === "ad" || task.kind === "checkin_ad") { setAdTaskKey(task.key); return; }
    if (task.kind === "whatsapp" && task.status === "available") { setWhatsAppOpen(true); return; }
    if (task.kind === "notifications" && task.status === "available") {
      setBusyTask(task.key);
      setNotice(null);
      try {
        const permission = await enablePush(supabase, user.id);
        if (permission === "denied") setError(t("rewards.pushBlocked"));
        if (permission === "unsupported") setError(t("rewards.pushUnsupported"));
      } finally {
        setBusyTask(null);
        refresh();
      }
      return;
    }
    // Email: only payable once the address is verified, so an unverified user
    // gets a (re)sent verification link instead of a claim.
    if (task.kind === "email" && task.status === "available") {
      setBusyTask(task.key);
      setNotice(null);
      const email = user.email ?? "";
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
      setBusyTask(null);
      if (resendError) setError(t("rewards.verifyEmailFailed"));
      else setNotice(t("rewards.verifyEmailSent", { email }));
      return;
    }
    if (task.kind === "reserve") { router.push("/library" as never); return; }
    setBusyTask(task.key);
    if (task.kind === "social" && task.status === "available") {
      await supabase.rpc("mark_social_visit", { p_task_key: task.key });
      if (task.action_url) Linking.openURL(task.action_url).catch(() => {});
      setBusyTask(null); refresh(); return;
    }
    const { data } = await supabase.rpc("claim_reward_task", { p_task_key: task.key });
    setBusyTask(null);
    if (!data?.ok) {
      const msgs: Record<string, string> = {
        email_not_verified: t("rewards.verifyEmailSent", { email: user.email ?? "" }),
        whatsapp_not_linked: t("rewards.linkWhatsappFirst"),
        permission_not_granted: t("rewards.enableNotificationsFirst"),
      };
      if (data?.error && msgs[data.error]) setError(msgs[data.error]);
    }
    refresh();
  }

  const loading = authLoading || !state;
  const weeklyMax = state ? state.streak.schedule.reduce((s, d) => s + d.coins, 0) : 0;
  const visibleTasks = state ? state.tasks.filter((tk) => (tk.kind === "ad" || tk.kind === "checkin_ad" ? state.ads_available : true)) : [];
  const bonusTask = visibleTasks.find((tk) => tk.key === "checkin_bonus_ad");

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-4 pt-5 pb-10" showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View className="flex-row items-center justify-between">
            <Text className="font-display text-2xl font-semibold text-text">{t("rewards.title")}</Text>
            <NotificationBell />
          </View>

          <View className="mt-4 flex-row items-stretch rounded-lg border border-border bg-surface">
            {[{ label: t("rewards.coins"), val: coinsDisplay, changed: coinsChanged },
              { label: t("rewards.rewardCoins"), val: rewardDisplay, changed: rewardChanged }
            ].map((col, i) => (
              <Pressable key={i} onPress={() => router.push("/wallet" as never)} className="flex-1 items-center gap-1 py-4">
                {loading ? <Skeleton className="h-7 w-14" /> : (
                  <Pop active={col.changed} trigger={col.val}>
                    <Text className="font-display text-[22px] font-semibold text-text" style={{ fontVariant: ["tabular-nums"] }}>{col.val.toLocaleString()}</Text>
                  </Pop>
                )}
                <Text className="text-[12px] text-muted">{col.label}</Text>
                {i === 0 && <View className="absolute right-0 top-4 bottom-4 w-px bg-border" />}
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => router.push("/points" as never)} className="mt-3 flex-row items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 active:bg-surface-raised">
            <View className="flex-row items-center gap-2.5">
              <Icon as={Gem} size={17} tone="pink" />
              <Text className="text-[14px] font-medium text-text">{t("rewards.memberPoints")}</Text>
              {!loading && <Text className="font-display font-semibold text-pink" style={{ fontVariant: ["tabular-nums"] }}>{state!.balances.points.toLocaleString()}</Text>}
            </View>
            <Icon as={ChevronRight} size={17} tone="muted" />
          </Pressable>

          {error ? <View className="mt-3 rounded-md bg-crimson-soft px-3 py-2"><Text className="text-[13px] text-crimson">{error}</Text></View> : null}

          {notice ? <View className="mt-3 rounded-md bg-surface-raised px-3 py-2"><Text className="text-[13px] text-text">{notice}</Text></View> : null}

          <View className="mt-6">
            <Text className="text-[13px] text-muted">{t("rewards.streak")} <Text className="font-semibold text-text">{loading ? "—" : state!.streak.current}</Text></Text>
            <View className="mt-3">
              {loading ? <Skeleton className="h-24 w-full" /> : (
                <StreakCalendar schedule={state!.streak.schedule} todayIndex={state!.streak.today_index} checkedInToday={state!.streak.checked_in_today} />
              )}
            </View>
            {!loading && (state!.streak.checked_in_today ? (
              state!.ads_available && bonusTask ? (
                <Button className="mt-4 w-full" disabled={bonusTask.status === "done" || busyTask === bonusTask.key} onPress={() => handleTask(bonusTask)}>
                  {t("rewards.getBonus")} ({bonusTask.done_count}/{bonusTask.daily_cap})
                </Button>
              ) : null
            ) : (
              <Button className="mt-4 w-full" disabled={checkingIn} onPress={handleCheckIn}>
                {checkingIn ? t("rewards.checkingIn") : t("rewards.checkIn")}
              </Button>
            ))}
            {weeklyMax > 0 && <Text className="mt-2 text-center text-[12px] text-muted">{t("rewards.earnUpTo", { n: weeklyMax })}</Text>}
          </View>

          {!loading && state!.offers.length > 0 && (
            <View className="mt-7">
              <Text className="font-display mb-2.5 text-[16px] font-semibold text-text">{t("rewards.dailyOffers")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
                {state!.offers.map((o) => <DailyOfferCard key={o.id} offer={o} />)}
              </ScrollView>
            </View>
          )}

          <View className="mt-7">
            <Text className="font-display mb-2.5 text-[16px] font-semibold text-text">{t("rewards.earn")}</Text>
            <View className="gap-2">
              {loading ? [1,2,3].map((i) => <Skeleton key={i} className="h-[62px] w-full" />) : (
                visibleTasks.filter((tk) => tk.kind !== "checkin_ad").map((tk) => (
                  <TaskRow key={tk.key} task={tk} busy={busyTask === tk.key} onAction={handleTask} />
                ))
              )}
            </View>
          </View>

          <Pressable onPress={() => router.push("/wallet" as never)} className="mt-8 flex-row items-center justify-center gap-2 overflow-hidden rounded-lg px-4 py-3 active:opacity-80">
            <BrandGradient radius={16} />
            <Icon as={Coins} size={18} tone="white" />
            <Text className="font-display text-[15px] font-semibold text-white">{t("rewards.visitStore")}</Text>
          </Pressable>
        </FadeIn>
      </ScrollView>

      <AdWatchSheet open={adTaskKey !== null} taskKey={adTaskKey} onClose={() => { setAdTaskKey(null); refresh(); }} onCredited={() => refresh()} />
      <WhatsAppLinkSheet open={whatsAppOpen} onClose={() => setWhatsAppOpen(false)} onLinked={async () => {
        setWhatsAppOpen(false);
        const { data } = await supabase.rpc("claim_reward_task", { p_task_key: "link_whatsapp" });
        if (!data?.ok && data?.error === "whatsapp_not_linked") setError(t("rewards.linkWhatsappFirst"));
        refresh();
      }} />
    </SafeAreaView>
  );
}
