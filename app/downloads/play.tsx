// app/downloads/play.tsx
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { Text } from "@/components/ui/Text";
import { getLocalUri } from "@/lib/offline";
import { useI18n } from "@/hooks/useI18n";

function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  // Stop picture and sound when another screen is pushed over this one.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) player.pause();
  }, [isFocused, player]);
  return (
    <VideoView
      player={player}
      style={{ flex: 1 }}
      nativeControls
      contentFit="contain"
    />
  );
}

export default function OfflinePlayPage() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [uri, setUri] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getLocalUri(String(id)).then((u) => {
      if (!cancelled) setUri(u);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <SafeAreaView edges={["top"]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 16 }}>
          <Text className="text-white">{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
      {uri ? (
        <Player uri={uri} />
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text className="text-white">
            {uri === null ? t("downloads.gone") : t("common.loading")}
          </Text>
        </View>
      )}
    </View>
  );
}