import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowLeft, Bell, Trash2 } from "lucide-react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { useNotifications } from "@/hooks/useNotifications";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { FadeIn } from "@/components/ui/FadeIn";

const supabase = createClient();
type Notif = { id: string; type: string; title: string; body: string|null; read: boolean; metadata: { href?: string }|null; created_at: string };

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<Notif[]|null>(null);
  const { unread, version, refresh, markAllRead } = useNotifications();

  // Reloads on open and whenever a notification arrives or changes.
  useEffect(() => {
    if (!user) return;
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100).then(({ data }) => setItems((data as Notif[]) ?? []));
  }, [user, version]);

  async function open(n: Notif) {
    if (!n.read) {
      setItems((p) => p?.map((x) => x.id===n.id?{...x,read:true}:x)??p);
      supabase.from("notifications").update({read:true}).eq("id",n.id).then(()=>refresh());
    }
    if (n.metadata?.href) router.push(n.metadata.href as never);
  }
  async function remove(id: string) { setItems((p) => p?.filter((x) => x.id!==id)??p); await supabase.from("notifications").delete().eq("id",id); refresh(); }
  async function readAll() { setItems((p) => p?.map((x) => ({...x, read:true}))??p); await markAllRead(); }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-4 pt-5 pb-10">
        <FadeIn>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => router.push("/rewards" as never)} hitSlop={10}><Icon as={ArrowLeft} size={20} tone="text" /></Pressable>
            <Text className="flex-1 font-display text-2xl font-semibold text-text">{t("notifications.title")}</Text>
            {unread > 0 ? (
              <Pressable onPress={readAll} hitSlop={8}><Text className="text-[13px] font-semibold text-pink">Mark all read</Text></Pressable>
            ) : null}
          </View>
          {items === null ? (
            <View className="mt-4 gap-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></View>
          ) : items.length === 0 ? (
            <View className="mt-16 items-center gap-2"><Icon as={Bell} size={28} tone="muted" /><Text className="text-[14px] text-muted">{t("notifications.empty")}</Text></View>
          ) : (
            <View className="mt-4 gap-2">
              {items.map((n) => (
                <View key={n.id} className={clsx("flex-row items-start gap-3 rounded-lg border border-border px-3.5 py-3", n.read?"bg-surface":"bg-pink/5")}>
                  <Pressable onPress={() => open(n)} className="min-w-0 flex-1">
                    <Text className="text-[14px] font-medium text-text">{n.title}</Text>
                    {n.body?<Text className="mt-0.5 text-[12.5px] text-muted">{n.body}</Text>:null}
                  </Pressable>
                  <Pressable onPress={() => remove(n.id)} accessibilityLabel={t("notifications.delete")} hitSlop={8}><Icon as={Trash2} size={15} tone="muted" /></Pressable>
                </View>
              ))}
            </View>
          )}
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
