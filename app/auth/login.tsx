// app/auth/login.tsx

import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { useI18n } from "@/hooks/useI18n";
import { translateAuthError } from "@/lib/i18n/authErrors";

export default function LoginPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string; error?: string }>();
  const supabase = createClient();
  const { t, lang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.error === "auth_callback_failed" ? t("auth.linkInvalid") : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (loading) return;
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(translateAuthError(error.message, t));
      return;
    }

    // Only ever redirect within the app — an absolute or protocol-relative
    // `next` value would be an open redirect.
    const rawNext = params.next;
    const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

    router.replace(next as never);
  }

  return (
    <AuthScreen>
      <Text className="font-display text-3xl font-semibold text-text">{t("auth.welcomeBack")}</Text>
      <Text className="mt-1.5 text-sm text-muted">{t("auth.signInToKeepWatching")}</Text>

      <View className="mt-7 gap-3">
        <Input
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          placeholder={t("auth.email")}
          value={email}
          onChangeText={setEmail}
        />
        <PasswordInput
          placeholder={t("auth.password")}
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
        />
        <View className="items-end">
          <TextLink href="/auth/forgot-password" className="text-[13px] font-medium text-muted underline">
            {t("auth.forgotPassword")}
          </TextLink>
        </View>
        {error ? <Text className="text-[13px] text-crimson">{error}</Text> : null}
        <Button className="w-full" size="lg" disabled={loading} onPress={handleSubmit}>
          {loading ? t("auth.signingIn") : lang === "en" ? "Sign In" : t("auth.signIn")}
        </Button>
      </View>

      <Text className="mt-5 text-center text-sm text-muted">
        {t("auth.newHere")}{" "}
        <TextLink href="/auth/signup" className="font-medium text-text underline">
          {t("auth.createAnAccount")}
        </TextLink>
      </Text>
    </AuthScreen>
  );
}
