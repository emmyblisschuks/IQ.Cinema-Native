import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Plus, Zap } from "lucide-react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { WEB_ORIGIN } from "@/lib/links";
import { SafeAreaView } from "react-native-safe-area-context";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { FadeIn } from "@/components/ui/FadeIn";

const supabase = createClient();
type Eligibility = { eligible: boolean; unique_views: number; unique_views_required: number; watch_hours: number; watch_hours_required: number; episode_count: number; episode_count_required: number; account_age_days: number; account_age_required: number };

function ProgressRow({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((value/Math.max(target,1))*100));
  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Text className="text-[12px] text-muted">{label}</Text>
        <Text className="text-[12px] text-text">{value.toLocaleString()} / {target.toLocaleString()}</Text>
      </View>
      <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <View className="h-full rounded-full bg-pink" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

const STATUS_KEYS: Record<string,string> = { draft:"creator.status.draft", in_review:"creator.status.in_review", published:"creator.status.published", coming_soon:"creator.status.coming_soon", suspended:"creator.status.suspended", rejected:"creator.status.rejected", withdrawn:"creator.status.withdrawn" };

export default function CreatorDashboardPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { wallet } = useWallet(user?.id);
  const { t } = useI18n();
  const [titles, setTitles] = useState<any[]>([]);
  const [eligibility, setEligibility] = useState<Eligibility|null>(null);
  const [isPartner, setIsPartner] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("titles").select("id, slug, title, status, genre, total_unique_views").eq("creator_id", user.id).order("created_at", { ascending: false }).then(({ data }) => setTitles(data??[]));
    supabase.from("creator_partner_state").select("is_partner").eq("user_id", user.id).single().then(({ data }) => setIsPartner(!!data?.is_partner));
    supabase.rpc("check_partner_eligibility", { p_user_id: user.id }).then(({ data }) => { const row = Array.isArray(data)?data[0]:data; setEligibility(row??null); });
  }, [user]);

  // Uploading and editing titles (video upload, storyboard, episode editor)
  // runs on the web app for now; open it in the in-app browser.
  function openWeb(path: string) {
    WebBrowser.openBrowserAsync(`${WEB_ORIGIN}${path}`).catch(() => {});
  }

  async function applyPartner() {
    if (!user) return;
    setApplying(true);
    await supabase.from("partner_applications").insert({ user_id: user.id, snapshot: eligibility??{} });
    setApplying(false);
  }

  if (!profile) return null;

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-4 pt-5 pb-10" showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View className="flex-row items-center justify-between">
            <Text className="font-display text-2xl font-semibold text-text">{t("creator.dashboard")}</Text>
            <Button size="sm" onPress={() => router.push("/creator/upload" as never)}><Icon as={Plus} size={15} tone="white" /> {t("creator.upload")}</Button>
          </View>

          <View className="mt-4 flex-row gap-3">
            {[{ label: t("creator.availableBalance"), val: `₦${(wallet?.earnings_balance_naira??0).toLocaleString()}` },
              { label: t("creator.inEscrow"), val: `₦${(wallet?.escrow_balance_naira??0).toLocaleString()}` }
            ].map((col) => (
              <View key={col.label} className="flex-1 rounded-md border border-border bg-surface p-3.5">
                <Text className="text-[11px] text-muted">{col.label}</Text>
                <Text className="mt-1 text-[19px] font-semibold text-text">{col.val}</Text>
              </View>
            ))}
          </View>

          {isPartner ? (
            <Button variant="primary" className="mt-3 w-full" onPress={() => router.push("/creator/withdraw" as never)}>{t("creator.requestWithdrawal")}</Button>
          ) : (
            <View className="mt-5 rounded-md border border-border bg-surface p-4">
              <Text className="text-[14px] font-semibold text-text">{t("creator.partnerProgress")}</Text>
              <Text className="mt-1 text-[12px] text-muted">{t("creator.partnerHint")}</Text>
              {eligibility ? (
                <View className="mt-3 gap-2.5">
                  <ProgressRow label={t("creator.uniqueViews")} value={eligibility.unique_views} target={eligibility.unique_views_required} />
                  <ProgressRow label={t("creator.watchHours")} value={eligibility.watch_hours} target={eligibility.watch_hours_required} />
                  <ProgressRow label={t("creator.episodesPublished")} value={eligibility.episode_count} target={eligibility.episode_count_required} />
                  <ProgressRow label={t("creator.accountAgeDays")} value={eligibility.account_age_days} target={eligibility.account_age_required} />
                  <Button className="mt-2 w-full" disabled={!eligibility.eligible||applying} onPress={applyPartner}>{eligibility.eligible?t("creator.applyPartner"):t("creator.notEligible")}</Button>
                </View>
              ) : <Skeleton className="mt-3 h-24 w-full" />}
            </View>
          )}

          <Text className="font-display mt-7 mb-2.5 text-[17px] font-semibold text-text">{t("creator.yourTitles")}</Text>
          <View className="overflow-hidden rounded-md border border-border bg-surface">
            {titles.map((row, i) => (
              <Pressable key={row.id} onPress={() => router.push(`/creator/title/${row.id}` as never)} className={`flex-row items-center justify-between px-4 py-3 active:bg-surface-raised ${i>0?"border-t border-border":""}`}>
                <View>
                  <Text className="text-[14px] font-medium text-text">{row.title}</Text>
                  <Text className="mt-0.5 text-[12px] text-muted">{STATUS_KEYS[row.status]?t(STATUS_KEYS[row.status]):row.status}{row.genre?` · ${row.genre}`:""}</Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <View className="flex-row items-center gap-1">
                    <Icon as={Zap} size={11} tone="gold" fillTone="gold" />
                    <Text className="text-[12px] text-muted">{row.total_unique_views}</Text>
                  </View>
                  {/* Add an episode without leaving the app */}
                  <Pressable
                    onPress={() => router.push(`/creator/upload?titleId=${row.id}` as never)}
                    hitSlop={8}
                    accessibilityLabel={t("upload.addUnit.episode")}
                    className="h-8 w-8 items-center justify-center rounded-full bg-pink"
                  >
                    <Icon as={Plus} size={16} tone="white" />
                  </Pressable>
                </View>
              </Pressable>
            ))}
            {!titles.length && <View className="px-4 py-6"><Text className="text-center text-sm text-muted">{t("creator.noTitles")}</Text></View>}
          </View>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
