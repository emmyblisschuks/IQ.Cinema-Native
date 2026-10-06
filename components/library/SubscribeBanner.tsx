import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ChevronRight, Crown } from "lucide-react-native";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";

const supabase = createClient();
const known = new Map<string, boolean>();

// Promo strip that only shows for people without an active subscription.
export function SubscribeBanner() {
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const userId = user?.id;
  const [subscribed, setSubscribed] = useState<boolean | null>(() =>
    userId ? known.get(userId) ?? null : null
  );

  useEffect(() => {
    if (!userId) return;
    let ignore = false;
    supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId) // RLS also lets admins read everyone's rows
      .eq("status", "active")
      .gt("current_period_end", new Date().toISOString())
      .limit(1)
      .then(({ data, error }) => {
        if (ignore || error) return;
        const active = (data ?? []).length > 0;
        known.set(userId, active);
        setSubscribed(active);
      });
    return () => {
      ignore = true;
    };
  }, [userId]);

  if (!userId) return null;
  if (subscribed === null) return <Skeleton className="h-[52px] w-full rounded-lg" />;
  if (subscribed) return null;

  return (
    <Pressable
      onPress={() => router.push("/wallet")}
      className="h-[52px] overflow-hidden rounded-lg"
      style={({ pressed }) => [
        { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
        pressed ? { transform: [{ scale: 0.99 }] } : null,
      ]}
    >
      <LinearGradient
        colors={["#f8e2ae", "#f0b95f"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      <View className="h-full flex-row items-center gap-3 px-3.5">
        {/* Always black on the gold gradient — a themed text colour turns
            near-white in dark mode and disappears into it. */}
        <Icon as={Crown} size={22} strokeWidth={1.75} tone="#000" fillTone="rgba(0,0,0,0.12)" />
        <Text className="flex-1 text-[16px] font-semibold tracking-tight" style={{ color: "#000" }}>
          {t("library.unlimitedAccess")}
        </Text>
        <View className="h-2 w-2 rounded-full bg-pink" />
        <Icon as={ChevronRight} size={20} tone="#000" />
      </View>
    </Pressable>
  );
}
