import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Text } from "@/components/ui/Text";
import type { DailyOffer } from "@/lib/rewards";
import { useI18n } from "@/hooks/useI18n";

export function DailyOfferCard({ offer }: { offer: DailyOffer }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/title/${offer.slug}` as never)} className="w-[112px] shrink-0">
      <View className="relative w-full overflow-hidden rounded-md bg-surface-raised" style={{ aspectRatio: 2/3 }}>
        {offer.poster_url && (
          <Image source={{ uri: offer.poster_url }} accessibilityLabel="" style={{ position:"absolute",left:0,right:0,top:0,bottom:0 }} contentFit="cover" />
        )}
        <View className="absolute left-0 top-0 rounded-br-md bg-crimson px-1.5 py-0.5">
          <Text className="text-[10px] font-bold text-white">{t("rewards.off", { n: offer.discount_percent })}</Text>
        </View>
      </View>
      <Text numberOfLines={2} className="mt-1.5 text-[12.5px] font-medium leading-tight text-text">{offer.title}</Text>
    </Pressable>
  );
}
