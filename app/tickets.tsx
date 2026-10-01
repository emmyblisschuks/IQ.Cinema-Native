import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowLeft, Ticket } from "lucide-react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { FadeIn } from "@/components/ui/FadeIn";

const supabase = createClient();
type Coupon = { id: string; name: string; discount_percent: number; expires_at: string; used_at: string|null };

export default function TicketsPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]|null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_coupons").select("id, name, discount_percent, expires_at, used_at").order("created_at", { ascending: false }).then(({ data }) => setCoupons((data as Coupon[]) ?? []));
  }, [user]);

  const now = Date.now();
  const loading = authLoading || !coupons;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-4 pt-5 pb-10">
        <FadeIn>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => router.push("/profile" as never)} hitSlop={10}><Icon as={ArrowLeft} size={20} tone="text" /></Pressable>
            <Text className="font-display text-2xl font-semibold text-text">{t("tickets.title")}</Text>
          </View>
          {loading ? (
            <View className="mt-5 gap-2.5"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></View>
          ) : coupons.length === 0 ? (
            <View className="mt-16 items-center gap-2"><Icon as={Ticket} size={28} tone="muted" /><Text className="text-[14px] text-muted">{t("tickets.empty")}</Text></View>
          ) : (
            <View className="mt-5 gap-2.5">
              {coupons.map((c) => {
                const expired = new Date(c.expires_at).getTime() < now;
                const spent = Boolean(c.used_at);
                const inactive = expired || spent;
                return (
                  <View key={c.id} className={clsx("flex-row items-center gap-3 rounded-lg border px-4 py-3.5", inactive ? "border-border bg-surface opacity-50" : "border-pink/40 bg-pink/5")}>
                    <View className={clsx("h-11 w-11 shrink-0 items-center justify-center rounded-full", inactive ? "bg-surface-raised" : "bg-pink/15")}>
                      <Icon as={Ticket} size={20} tone={inactive ? "muted" : "pink"} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="text-[14px] font-semibold text-text">{c.name}</Text>
                      <Text className="mt-0.5 text-[12.5px] text-muted">{t("tickets.discountLine", { pct: c.discount_percent, status: spent ? t("tickets.used") : expired ? t("tickets.expired") : t("tickets.expires", { date: new Date(c.expires_at).toLocaleDateString(lang) }) })}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
