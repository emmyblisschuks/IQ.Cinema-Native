import { View } from "react-native";
import { Zap } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";

export type CoinPack = {
  id: string;
  name: string;
  coins: number;
  bonus_coins: number;
  price_naira: number;
};

export function CoinPackCard({
  pack,
  onBuy,
  loading,
}: {
  pack: CoinPack;
  onBuy: (id: string) => void;
  loading: boolean;
}) {
  const bonusPct = pack.bonus_coins > 0 ? Math.round((pack.bonus_coins / pack.coins) * 100) : 0;

  return (
    <View className="flex-row items-center justify-between rounded-md border border-border bg-surface px-4 py-3.5">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-gold-soft">
          <Icon as={Zap} size={18} tone="gold" fillTone="gold" />
        </View>
        <View>
          <Text className="text-[15px] font-semibold text-text">
            {pack.coins + pack.bonus_coins}
            <Text className="ml-1 text-[12px] font-normal text-muted"> coins</Text>
          </Text>
          {bonusPct > 0 ? <Text className="text-[11px] font-medium text-gold">+{bonusPct}% bonus</Text> : null}
        </View>
      </View>

      <Button variant="secondary" size="sm" disabled={loading} onPress={() => onBuy(pack.id)}>
        {`₦${pack.price_naira.toLocaleString()}`}
      </Button>
    </View>
  );
}
