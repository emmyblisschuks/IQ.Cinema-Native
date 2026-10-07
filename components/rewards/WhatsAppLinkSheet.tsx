import { useState } from "react";
import { View } from "react-native";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useI18n } from "@/hooks/useI18n";

const supabase = createClient();

export function WhatsAppLinkSheet({ open, onClose, onLinked }: { open: boolean; onClose: () => void; onLinked: () => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    const { data, error: rpcError } = await supabase.rpc("link_whatsapp", { p_number: value });
    setBusy(false);
    if (rpcError || !data?.ok) { setError(data?.error === "number_in_use" ? t("whatsapp.inUse") : t("whatsapp.invalid")); return; }
    setValue(""); onLinked();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("whatsapp.title")}>
      <View className="px-4 pb-4 pt-1">
        <Text className="text-[13px] text-muted">{t("whatsapp.blurb")}</Text>
        <Input keyboardType="phone-pad" placeholder="080X XXX XXXX" value={value} onChangeText={setValue} className="mt-3" autoFocus />
        {error ? <Text className="mt-2 text-[12.5px] text-crimson">{error}</Text> : null}
        <Button className="mt-4 w-full" disabled={busy || !value.trim()} onPress={submit}>
          {busy ? t("whatsapp.linking") : t("whatsapp.link")}
        </Button>
      </View>
    </BottomSheet>
  );
}
