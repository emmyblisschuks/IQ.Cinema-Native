// app/rewards.tsx

import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Zap, Gift, Flame, Users, Wallet, ChevronRight } from "lucide-react-native";
import clsx from "clsx";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { Pop } from "@/components/ui/Pop";
import { PulseGlow } from "@/components/ui/PulseGlow";
import { BrandGradient } from "@/components/ui/BrandGradient";
import { useTheme } from "@/hooks/useTheme";
import { rgba } from "@/lib/theme";

export default function RewardsPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const { wallet, loading: walletLoading } = useWallet(user?.id);
  const { display: balanceDisplay, changed: balanceChanged } = useAnimatedNumber(wallet?.coin_balance);

  const isCreator = profile?.role === "creator" || profile?.creator_status === "partner";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-4 pb-24 pt-6" showsVerticalScrollIndicator={false}>
        <Text className="font-display text-2xl font-semibold text-text">Rewards</Text>
        <Text className="mt-2 text-sm text-muted">
          Track your coin balance, earn more, and see what's waiting for you.
        </Text>

        {/* Balance summary, links into the wallet for buying/managing coins */}
        <Pressable
          onPress={() => router.push("/wallet")}
          className="mt-5 flex-row items-center justify-between rounded-lg border border-border bg-surface p-4 active:bg-surface-raised"
        >
          <View>
            <Text className="text-[12px] text-muted">Coin balance</Text>
            {walletLoading || authLoading ? (
              <Skeleton className="mt-2 h-8 w-24" />
            ) : (
              <Pop active={balanceChanged} style={{ alignSelf: "flex-start" }}>
                <View className="mt-1 flex-row items-center gap-1.5">
                  <Icon as={Zap} size={20} tone="gold" fillTone="gold" />
                  <Text className="font-display text-2xl font-semibold text-text" style={{ fontVariant: ["tabular-nums"] }}>
                    {balanceDisplay.toLocaleString()}
                  </Text>
                </View>
              </Pop>
            )}
          </View>
          <View className="flex-row items-center gap-1">
            <Icon as={Wallet} size={16} tone="pink" />
            <Text className="text-[13px] font-semibold text-pink">Go to wallet</Text>
            <Icon as={ChevronRight} size={16} tone="pink" />
          </View>
        </Pressable>

        {/* Ways to earn more coins */}
        <View className="mt-7">
          <Text className="font-display mb-2.5 text-[17px] font-semibold text-text">Ways to earn</Text>
          <View className="gap-2">
            <RewardRow
              tone="crimson"
              pulse
              icon={<Icon as={Flame} size={18} tone="crimson" />}
              title="Daily streak"
              description="Open IQ Cinema every day to build your streak and unlock bonus coins."
            />
            <RewardRow
              tone="pink"
              icon={<Icon as={Gift} size={18} tone="pink" />}
              title="Watch milestones"
              description="Finish episodes and titles to unlock milestone rewards as you go."
            />
            <RewardRow
              tone="pink"
              icon={<Icon as={Users} size={18} tone="pink" />}
              title="Invite friends"
              description="Share IQ Cinema with friends — you'll both get a coin bonus when they join."
            />
          </View>
        </View>

        {/* Creator payouts, only shown to approved creators/partners */}
        {!authLoading && isCreator ? (
          <View className="mt-7">
            <Text className="font-display mb-2.5 text-[17px] font-semibold text-text">Creator earnings</Text>
            <Pressable
              onPress={() => router.push("/creator/withdraw")}
              className="flex-row items-center justify-between rounded-lg border border-border bg-surface p-4 active:bg-surface-raised"
            >
              <View>
                <Text className="text-[12px] text-muted">Available to withdraw</Text>
                <Text className="font-display mt-1 text-xl font-semibold text-text">
                  {`₦${wallet?.earnings_balance_naira?.toLocaleString() ?? 0}`}
                </Text>
              </View>
              <Icon as={ChevronRight} size={18} tone="muted" />
            </Pressable>
          </View>
        ) : null}

        {/* Direct CTA to buy coins / subscribe */}
        <Pressable
          onPress={() => router.push("/wallet")}
          className="mt-8 overflow-hidden rounded-lg"
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <BrandGradient radius={16} />
          <View className="flex-row items-center justify-center gap-2 px-4 py-3">
            <Icon as={Zap} size={18} tone="white" fillTone="white" />
            <Text className="font-display text-[15px] font-semibold text-white">Buy coins or subscribe</Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function RewardRow({
  icon,
  title,
  description,
  tone = "gold",
  pulse = false,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  tone?: "gold" | "pink" | "crimson";
  pulse?: boolean;
}) {
  const { tokens } = useTheme();
  const toneBg = { gold: "bg-gold-soft", pink: "bg-pink/10", crimson: "bg-crimson-soft" }[tone];
  const glow = rgba(tokens["--crimson"], 1);

  const badge = (
    <View className={clsx("h-9 w-9 items-center justify-center rounded-full", toneBg)}>{icon}</View>
  );

  return (
    <View className="flex-row items-start gap-3 rounded-lg border border-border bg-surface p-3.5">
      <View className="mt-0.5">
        {pulse ? (
          <PulseGlow color={glow} size={36}>
            {badge}
          </PulseGlow>
        ) : (
          badge
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[14px] font-semibold text-text">{title}</Text>
        <Text className="mt-0.5 text-[12.5px] text-muted">{description}</Text>
      </View>
    </View>
  );
}
