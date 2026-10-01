// app/downloads/index.tsx
import { Alert, FlatList, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Text } from "@/components/ui/Text";
import { createClient } from "@/lib/supabase/client";
import { useDownloads } from "@/hooks/useDownloads";
import { removeDownload, startDownload, type DownloadRow } from "@/lib/offline";

const supabase = createClient();

function sizeLabel(bytes: number) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export default function DownloadsPage() {
  const router = useRouter();
  const { rows, loading } = useDownloads();

  function confirmRemove(r: DownloadRow) {
    Alert.alert("Remove download?", `${r.title} - EP${r.episode_number}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => void removeDownload(r.episode_id),
      },
    ]);
  }

  function open(r: DownloadRow) {
    if (r.status === "done") {
      router.push(`/downloads/play?id=${r.episode_id}` as never);
    } else if (r.status === "error") {
      void startDownload(supabase, r);
    }
  }

  function statusText(r: DownloadRow) {
    if (r.status === "done") return `Ready offline ${sizeLabel(r.bytes)}`.trim();
    if (r.status === "error") return "Failed. Tap to retry";
    return `Downloading ${Math.round(r.progress * 100)}%`;
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="px-6 pb-3 pt-2">
        <Text className="font-display text-2xl font-semibold text-text">Downloads</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.episode_id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
        ListEmptyComponent={
          loading ? null : (
            <Text className="text-text">
              No downloads yet. Tap Download on an episode to watch it offline.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => open(item)}
            onLongPress={() => confirmRemove(item)}
            style={{ paddingVertical: 14 }}
          >
            <Text className="font-display text-lg text-text">{item.title}</Text>
            <Text className="text-text">
              EP{item.episode_number}  {statusText(item)}
            </Text>
            {item.status === "downloading" ? (
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  marginTop: 8,
                  backgroundColor: "rgba(128,128,128,0.3)",
                }}
              >
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: "#e11d48",
                    width: `${Math.round(item.progress * 100)}%`,
                  }}
                />
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}