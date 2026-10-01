import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/ui/Icon";
import { FadeIn } from "@/components/ui/FadeIn";

const supabase = createClient();

export default function WithdrawPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { wallet, refresh } = useWallet(user?.id);
  const { t } = useI18n();
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = wallet?.earnings_balance_naira ?? 0;

  async function handleSubmit() {
    setSubmitting(true); setError(null);
    const amtNum = Number(amount.replace(/,/g, ""));
    if (!amtNum || amtNum <= 0) { setError("Enter a valid amount."); setSubmitting(false); return; }
    if (amtNum > available) { setError("Amount exceeds your available balance."); setSubmitting(false); return; }
    const { error: e } = await supabase.from("withdrawal_requests").insert({ user_id: user!.id, amount_naira: amtNum, account_number: account, bank_code: bankCode });
    setSubmitting(false);
    if (e) { setError(e.message); return; }
    await refresh();
    setDone(true);
  }

  if (done) return (
    <SafeAreaView edges={["top"]} className="flex-1 items-center justify-center bg-bg px-8">
      <Text className="font-display text-xl font-semibold text-text">Request submitted</Text>
      <Text className="mt-2 text-center text-sm text-muted">We'll process your withdrawal within 3–5 business days.</Text>
      <Button variant="secondary" className="mt-5" onPress={() => router.replace("/creator/dashboard" as never)}>Back to dashboard</Button>
    </SafeAreaView>
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-4 pt-5 pb-10">
        <FadeIn>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => router.push("/creator/dashboard" as never)} hitSlop={10}><Icon as={ArrowLeft} size={20} tone="text" /></Pressable>
            <Text className="font-display text-2xl font-semibold text-text">{t("creator.requestWithdrawal")}</Text>
          </View>
          <View className="mt-4 rounded-md border border-border bg-surface px-4 py-3">
            <Text className="text-[12px] text-muted">{t("creator.availableBalance")}</Text>
            <Text className="mt-1 font-display text-xl font-semibold text-text">₦{available.toLocaleString()}</Text>
          </View>
          <View className="mt-5 gap-3">
            <Input placeholder="Amount (₦)" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <Input placeholder="Account number" keyboardType="numeric" value={account} onChangeText={setAccount} />
            <Input placeholder="Bank code (e.g. 058)" keyboardType="numeric" value={bankCode} onChangeText={setBankCode} />
            {error ? <Text className="text-[13px] text-crimson">{error}</Text> : null}
            <Button className="w-full" size="lg" disabled={submitting || !amount || !account || !bankCode} onPress={handleSubmit}>{submitting ? "Submitting…" : "Request withdrawal"}</Button>
          </View>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
