// app/for-you.tsx

import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui/Text";

export default function ForYouPage() {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-4 pb-24 pt-6">
        <Text className="font-display text-2xl font-semibold text-text">For You</Text>
        <Text className="mt-2 text-sm text-muted">Personalized picks are coming soon.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
