// components/shared/CoinBadge.tsx

import { View } from "react-native";
import { Zap } from "lucide-react-native";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { Pop } from "@/components/ui/Pop";

export function CoinBadge({ amount, pop = false }: { amount: number; pop?: boolean }) {
  return (
    <Pop active={pop} trigger={amount} style={{ alignSelf: "flex-start" }}>
      <View className="flex-row items-center gap-1 rounded-full border border-border bg-surface-raised px-2.5 py-1">
        <Icon as={Zap} size={13} tone="gold" fillTone="gold" />
        <Text className="text-sm font-semibold text-text">{amount.toLocaleString()}</Text>
      </View>
    </Pop>
  );
}
