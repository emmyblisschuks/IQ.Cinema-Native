import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import { TextInput } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";

export function HomeHeader() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function handleSubmit() {
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <View className="flex-row items-center gap-2 px-4 pt-5">
      <View className="h-10 flex-1 flex-row items-center gap-2 rounded-full border border-border bg-surface px-3.5">
        <Icon as={Search} size={16} tone="muted" />
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={handleSubmit}
          returnKeyType="search"
          placeholder="Search titles..."
          className="flex-1 bg-transparent p-0 text-sm text-text"
        />
      </View>

      <Image
        source={require("@/assets/icon.png")}
        accessibilityLabel="IQ Cinema"
        style={{ width: 38, height: 38 }}
        contentFit="contain"
      />
    </View>
  );
}
