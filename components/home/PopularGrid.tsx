import { View } from "react-native";
import { PopularCard, type PopularCardData } from "./PopularCard";
import { Text } from "@/components/ui/Text";
import { useGridCell } from "@/lib/layout";
import { useI18n } from "@/hooks/useI18n";

export function PopularGrid({ heading, titles }: { heading: string; titles: PopularCardData[] }) {
  const { t } = useI18n();
  const cell = useGridCell(2, 12);

  if (!titles.length) {
    return (
      <View className="mt-8 px-6">
        <Text className="text-center text-sm text-muted">{t("home.nothingHere")}</Text>
      </View>
    );
  }

  return (
    <View className="mt-6 px-4">
      <Text className="font-display mb-3 text-[19px] font-semibold text-text">{heading}</Text>
      <View className="flex-row flex-wrap gap-x-3 gap-y-5">
        {titles.map((t, i) => (
          <PopularCard key={t.id} title={t} rank={i + 1} width={cell} />
        ))}
      </View>
    </View>
  );
}
