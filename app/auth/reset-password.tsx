// app/auth/reset-password.tsx

import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Text } from "@/components/ui/Text";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { useI18n } from "@/hooks/useI18n";
import { translateAuthError } from "@/lib/i18n/authErrors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useI18n();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // A valid recovery session only exists if the person actually arrived via a
  // real (unexpired, unused) reset link that /auth/callback just exchanged.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, [supabase]);

  async function handleSubmit() {
    if (loading) return;
    setError(null);

    if (password.length < 6) {
      setError(t("auth.passwordMin"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordsDontMatch"));
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(translateAuthError(updateError.message, t));
      return;
    }

    setDone(true);
    setTimeout(() => router.replace("/"), 1500);
  }

  if (checking) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <Text className="text-[14px] text-muted">{t("auth.checkingLink")}</Text>
      </View>
    );
  }

  if (!hasSession) {
    return (
      <AuthScreen>
        <Text className="font-display text-3xl font-semibold text-text">{t("auth.linkExpired")}</Text>
        <Text className="mt-1.5 text-sm text-muted">
          {t("auth.linkExpiredBody")}
        </Text>
        <Button className="mt-7 w-full" size="lg" onPress={() => router.replace("/auth/forgot-password")}>
          {t("auth.requestNewLink")}
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <Text className="font-display text-3xl font-semibold text-text">{t("auth.setNewPassword")}</Text>
      <Text className="mt-1.5 text-sm text-muted">{t("auth.chooseNew")}</Text>

      {done ? (
        <View className="mt-7 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-4 py-3">
          <Text className="text-[14px] text-emerald-500">{t("auth.passwordUpdated")}</Text>
        </View>
      ) : (
        <View className="mt-7 gap-3">
          <PasswordInput
            placeholder={t("auth.newPassword")}
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
          />
          <PasswordInput
            placeholder={t("auth.confirmNewPassword")}
            autoComplete="new-password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onSubmitEditing={handleSubmit}
          />
          {error ? <Text className="text-[13px] text-crimson">{error}</Text> : null}
          <Button className="w-full" size="lg" disabled={loading} onPress={handleSubmit}>
            {loading ? t("auth.updating") : t("auth.updatePassword")}
          </Button>
        </View>
      )}
    </AuthScreen>
  );
}
