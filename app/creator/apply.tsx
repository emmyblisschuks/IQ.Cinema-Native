import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowLeft, ChevronDown } from "lucide-react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TextInput } from "@/components/ui/Text";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { FadeIn } from "@/components/ui/FadeIn";

const supabase = createClient();

export default function CreatorApplyPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  const [bio, setBio] = useState(""); const [portfolioUrl, setPortfolioUrl] = useState(""); const [primaryGenre, setPrimaryGenre] = useState(""); const [sampleUrl, setSampleUrl] = useState("");
  const [submitting, setSubmitting] = useState(false); const [done, setDone] = useState(false); const [error, setError] = useState<string|null>(null);
  const [genres, setGenres] = useState<string[]>([]); const [genreOpen, setGenreOpen] = useState(false);

  useEffect(() => { supabase.from("genres").select("name").order("name").then(({ data }) => setGenres((data??[]).map((g:any)=>g.name))); }, []);

  async function handleSubmit() {
    if (!user) { router.push("/auth/login" as never); return; }
    setSubmitting(true); setError(null);
    const { error: e } = await supabase.from("creator_applications").insert({ user_id: user.id, bio, portfolio_url: portfolioUrl||null, primary_genre: primaryGenre||null, sample_url: sampleUrl||null });
    if (e) { setError(e.message); setSubmitting(false); return; }
    await supabase.from("profiles").update({ creator_status: "applied" }).eq("id", user.id);
    setSubmitting(false); setDone(true);
  }

  if (done) return (
    <SafeAreaView edges={["top"]} className="flex-1 items-center justify-center bg-bg px-8">
      <FadeIn style={{ alignItems:"center" }}>
        <Text className="font-display text-xl font-semibold text-text">{t("creator.applicationSent")}</Text>
        <Text className="mt-2 text-center text-sm text-muted">{t("creator.applicationSentBody")}</Text>
        <Button variant="secondary" className="mt-5" onPress={() => router.replace("/profile" as never)}>{t("creator.backToProfile")}</Button>
      </FadeIn>
    </SafeAreaView>
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-4 pt-5 pb-10">
        <FadeIn>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => router.push("/profile" as never)} hitSlop={10}><Icon as={ArrowLeft} size={20} tone="text" /></Pressable>
            <Text className="font-display text-2xl font-semibold text-text">{t("creator.becomeCreator")}</Text>
          </View>
          <Text className="mt-2 text-[13px] leading-relaxed text-muted">{t("creator.applyIntro")}</Text>
          <View className="mt-6 gap-3">
            <TextInput multiline numberOfLines={4} placeholder={t("creator.aboutWork")} value={bio} onChangeText={setBio} className="w-full rounded-md border border-border bg-surface px-4 py-3 text-[14px] text-text" style={{ textAlignVertical:"top", minHeight:96 }} />
            <Pressable onPress={() => setGenreOpen(true)} className="h-12 w-full flex-row items-center justify-between rounded-md border border-border bg-surface px-4">
              <Text className={primaryGenre ? "text-[14px] text-text" : "text-[14px] text-muted"}>{primaryGenre || t("creator.primaryGenre")}</Text>
              <Icon as={ChevronDown} size={18} tone="muted" />
            </Pressable>
            <Input placeholder={t("creator.portfolioLink")} value={portfolioUrl} onChangeText={setPortfolioUrl} keyboardType="url" autoCapitalize="none" />
            <Input placeholder={t("creator.sampleLink")} value={sampleUrl} onChangeText={setSampleUrl} keyboardType="url" autoCapitalize="none" />
            {error ? <Text className="text-[13px] text-crimson">{error}</Text> : null}
            <Button className="w-full" size="lg" disabled={submitting||!bio.trim()} onPress={handleSubmit}>{submitting?t("creator.submitting"):t("creator.submitApplication")}</Button>
          </View>
        </FadeIn>
      </ScrollView>
      <BottomSheet open={genreOpen} onClose={() => setGenreOpen(false)} title={t("creator.primaryGenre")}>
        <View className="pb-2">
          {genres.map((g) => (
            <Pressable key={g} onPress={() => { setPrimaryGenre(g); setGenreOpen(false); }} className="mx-2 rounded-md px-3.5 py-3 active:bg-surface-raised">
              <Text className={`text-[15px] ${primaryGenre===g?"font-semibold text-pink":"text-text"}`}>{g}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
