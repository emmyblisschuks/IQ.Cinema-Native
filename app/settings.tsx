import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useI18n } from "@/hooks/useI18n";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { WhatsAppLinkSheet } from "@/components/rewards/WhatsAppLinkSheet";
import { FadeIn } from "@/components/ui/FadeIn";
import { useTheme } from "@/hooks/useTheme";

const supabase = createClient();
type Language = { code: string; native_label: string };

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
      <Text className="flex-1 pr-3 text-[14px] text-text">{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.pink }} thumbColor="#fff" />
    </View>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { settings, loaded, error, update, reload } = useUserSettings();
  const { t } = useI18n();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [waOpen, setWaOpen] = useState(false);

  useEffect(() => {
    supabase.from("app_languages").select("code, native_label").eq("enabled", true).order("sort_order").then(({ data }) => setLanguages((data as Language[]) ?? []));
  }, []);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-4 pt-5 pb-10" showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => router.push("/profile" as never)} hitSlop={10}><Icon as={ArrowLeft} size={20} tone="text" /></Pressable>
            <Text className="font-display text-2xl font-semibold text-text">{t("settings.title")}</Text>
          </View>

          {error ? <View className="mt-3 rounded-md bg-crimson-soft px-3 py-2"><Text className="text-[13px] text-crimson">{t("settings.saveError")}</Text></View> : null}

          {!loaded ? (
            <View className="mt-5 gap-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></View>
          ) : (
            <>
              <View className="mt-6">
                <Text className="font-display mb-2 text-[14px] font-semibold text-text">{t("settings.appearance")}</Text>
                <View className="flex-row items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
                  <Text className="text-[14px] text-text">{t("settings.appearance")}</Text>
                  <ThemeToggle />
                </View>
              </View>

              {languages.length > 0 && (
                <View className="mt-6">
                  <Text className="font-display mb-2 text-[14px] font-semibold text-text">{t("settings.language")}</Text>
                  <View className="overflow-hidden rounded-md border border-border bg-surface">
                    {languages.map((l, i) => (
                      <Pressable key={l.code} onPress={() => update({ language: l.code })}
                        className={`flex-row items-center justify-between px-4 py-3 ${i>0?"border-t border-border":""} active:bg-surface-raised`}>
                        <Text className="text-[14px] text-text">{l.native_label}</Text>
                        {settings.language === l.code && <Text className="text-pink">✓</Text>}
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <View className="mt-6">
                <Text className="font-display mb-2 text-[14px] font-semibold text-text">{t("settings.playback")}</Text>
                <ToggleRow label={t("settings.autoplay")} value={settings.autoplay_next} onChange={(v) => update({ autoplay_next: v })} />
              </View>

              <View className="mt-6 gap-2">
                <Text className="font-display mb-0 text-[14px] font-semibold text-text">{t("settings.notifications")}</Text>
                <ToggleRow label={t("settings.newEpisodes")} value={settings.notify_new_episodes} onChange={(v) => update({ notify_new_episodes: v })} />
                <ToggleRow label={t("settings.rewards")} value={settings.notify_rewards} onChange={(v) => update({ notify_rewards: v })} />
                <ToggleRow label={t("settings.promos")} value={settings.notify_promos} onChange={(v) => update({ notify_promos: v })} />
              </View>

              <View className="mt-6">
                <Text className="font-display mb-2 text-[14px] font-semibold text-text">{t("settings.whatsapp")}</Text>
                <Pressable onPress={() => setWaOpen(true)} className="flex-row items-center justify-between rounded-md border border-border bg-surface px-4 py-3 active:bg-surface-raised">
                  <Text className="text-[14px] text-text">{settings.whatsapp_number ?? t("settings.notLinked")}</Text>
                  <Text className="text-[12.5px] font-semibold text-pink">{settings.whatsapp_number ? t("settings.change") : t("settings.link")}</Text>
                </Pressable>
              </View>
            </>
          )}
        </FadeIn>
      </ScrollView>
      <WhatsAppLinkSheet open={waOpen} onClose={() => setWaOpen(false)} onLinked={() => { setWaOpen(false); reload(); }} />
    </SafeAreaView>
  );
}
