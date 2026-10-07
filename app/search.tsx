// app/search.tsx

import { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui/Text";
import { useI18n } from "@/hooks/useI18n";

export default function SearchPage() {
  const { t } = useI18n();
  const { q } = useLocalSearchParams<{ q?: string }>();
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-4 pb-24 pt-6">
        <Text className="font-display text-2xl font-semibold text-text">{q ? t("search.resultsFor", { q }) : t("search.title")}</Text>
        <Text className="mt-2 text-sm text-muted">{t("search.comingSoon")}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
