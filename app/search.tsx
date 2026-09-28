// app/search.tsx

import { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui/Text";

export default function SearchPage() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-4 pb-24 pt-6">
        <Text className="font-display text-2xl font-semibold text-text">{q ? `Results for "${q}"` : "Search"}</Text>
        <Text className="mt-2 text-sm text-muted">Search results are coming soon.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
