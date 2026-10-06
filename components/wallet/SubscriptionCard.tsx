import { View } from "react-native";
import { Sparkles } from "lucide-react-native";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/hooks/useI18n";
import type { SubscriptionPlan } from "@/lib/store";

export type { SubscriptionPlan };

const INTERVAL_KEY = { weekly: "wallet.week", monthly: "wallet.month", annual: "wallet.year" } as const;

export function SubscriptionCard({
  plan,
  highlighted,
  onSubscribe,
  loading,
}: {
  plan: SubscriptionPlan;
  highlighted?: boolean;
  onSubscribe: (id: string) => void;
  loading: boolean;
}) {
  const { t, lang } = useI18n();
  const interval = t(INTERVAL_KEY[plan.interval]);
  const showIntro = plan.intro_eligible && plan.intro_price_naira != null;
  const price = showIntro ? plan.intro_price_naira! : plan.price_naira;

  return (
    <View className={clsx("relative rounded-lg border p-4", highlighted ? "border-pink bg-crimson-soft" : "border-border bg-surface")}>
      {plan.badge ? (
        <View className="absolute right-3 rounded-full bg-crimson px-2.5 py-0.5" style={{ top: -10 }}>
          <Text className="text-[10px] font-bold text-white">{plan.badge}</Text>
        </View>
      ) : null}
      <Text className="text-[15px] font-semibold text-text">👑 {plan.name}</Text>
      {plan.description ? <Text className="mt-1 text-[13px] text-muted">{plan.description}</Text> : null}

      <View className="mt-2.5 flex-row items-baseline gap-2">
        <Text className="font-display text-[22px] font-semibold text-pink">{`₦${price.toLocaleString()}`}</Text>
        {showIntro ? (
          <Text className="text-[13px] font-medium text-muted" style={{ textDecorationLine: "line-through" }}>
            {`₦${plan.price_naira.toLocaleString()}`}
          </Text>
        ) : null}
      </View>
      {showIntro ? (
        <Text className="text-[11.5px] text-muted">
          {t("wallet.introPrice", {
            intro: plan.intro_price_naira!.toLocaleString(lang),
            price: plan.price_naira.toLocaleString(lang),
            interval,
          })}
        </Text>
      ) : null}
      <Text className="text-[11.5px] text-muted">{t("wallet.autoRenew")}</Text>

      {plan.ai_generations != null && plan.ai_generations > 0 ? (
        <View className="mt-3 flex-row items-center gap-1.5 rounded-md bg-surface-raised px-3 py-2">
          <Icon as={Sparkles} size={14} tone="pink" />
          <Text className="text-[12.5px] text-text">{t("wallet.aiGenerations", { n: plan.ai_generations, interval })}</Text>
        </View>
      ) : null}

      <Button className="mt-3.5 w-full" variant={highlighted ? "primary" : "secondary"} disabled={loading} onPress={() => onSubscribe(plan.id)}>
        {loading ? t("wallet.starting") : t("wallet.subscribe")}
      </Button>
    </View>
  );
}
