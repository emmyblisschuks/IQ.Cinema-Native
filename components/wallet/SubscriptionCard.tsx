import { View } from "react-native";
import { Check } from "lucide-react-native";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";

export type SubscriptionPlan = {
  id: string;
  name: string;
  interval: "weekly" | "monthly" | "annual";
  price_naira: number;
  includes_new_releases: boolean;
};

function Perk({ children }: { children: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon as={Check} size={14} tone="crimson" />
      <Text className="text-[13px] text-text/85">{children}</Text>
    </View>
  );
}

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
  return (
    <View className={clsx("rounded-md border p-4", highlighted ? "border-pink bg-pink/10" : "border-border bg-surface")}>
      <View className="flex-row items-center justify-between">
        <Text className="text-[15px] font-semibold text-text">{plan.name}</Text>
        {highlighted ? (
          <View className="rounded-full bg-pink px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-white">Best value</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-1 text-[22px] font-semibold text-text">
        {`₦${plan.price_naira.toLocaleString()}`}
        <Text className="text-[13px] font-normal text-muted">{` /${plan.interval}`}</Text>
      </Text>
      <View className="mt-3 gap-1.5">
        <Perk>Unlimited back-catalog</Perk>
        <Perk>Ad-free</Perk>
        {plan.includes_new_releases ? <Perk>Day-one new releases</Perk> : null}
      </View>
      <Button className="mt-4 w-full" variant={highlighted ? "primary" : "secondary"} disabled={loading} onPress={() => onSubscribe(plan.id)}>
        Subscribe
      </Button>
    </View>
  );
}
