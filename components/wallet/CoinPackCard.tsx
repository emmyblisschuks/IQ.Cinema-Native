import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Zap } from "lucide-react-native";
import clsx from "clsx";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import type { CoinPack } from "@/lib/store";

export type { CoinPack };

export function CoinPackCard({
  pack,
  highlighted,
  onBuy,
  loading,
}: {
  pack: CoinPack;
  highlighted?: boolean;
  onBuy: (id: string) => void;
  loading: boolean;
}) {
  const bonusPct = pack.bonus_coins > 0 ? Math.round((pack.bonus_coins / pack.coins) * 100) : 0;

  return (
    <Pressable
      disabled={loading}
      onPress={() => onBuy(pack.id)}
      className={clsx(
        "relative w-full overflow-hidden rounded-lg border px-3.5 py-3",
        highlighted ? "border-pink bg-crimson-soft" : "border-border bg-surface"
      )}
      style={({ pressed }) => ({ opacity: loading ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      {bonusPct > 0 ? (
        <View className="absolute right-0 top-0 overflow-hidden rounded-bl-md">
          <LinearGradient colors={["#ff2a69", "#962d28"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text className="text-[10px] font-bold text-white">{bonusPct}%</Text>
            <Zap size={9} color="#fff" fill="#fff" />
          </LinearGradient>
        </View>
      ) : null}
      <View className="flex-row items-center gap-1.5">
        <Icon as={Zap} size={16} tone="gold" fillTone="gold" />
        <Text className="font-display text-[17px] font-semibold text-text">{pack.coins}</Text>
        {pack.bonus_coins > 0 ? <Text className="text-[13px] font-medium text-gold">+{pack.bonus_coins}</Text> : null}
      </View>
      <Text className="mt-1.5 text-[13px] font-semibold text-text">{`₦${pack.price_naira.toLocaleString()}`}</Text>
    </Pressable>
  );
}
