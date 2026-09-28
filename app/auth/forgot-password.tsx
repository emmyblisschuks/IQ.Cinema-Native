// app/auth/forgot-password.tsx

import { useState } from "react";
import { View } from "react-native";
import * as Linking from "expo-linking";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { AuthScreen } from "@/components/auth/AuthScreen";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (loading) return;
    if (!email.trim()) {
      setError("Enter the email on your account.");
      return;
    }
    setLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL("/auth/callback", { queryParams: { next: "/auth/reset-password" } }),
    });

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <AuthScreen>
      <Text className="font-display text-3xl font-semibold text-text">Reset your password</Text>
      <Text className="mt-1.5 text-sm text-muted">
        {sent
          ? "Check your inbox for a reset link."
          : "Enter the email on your account and we'll send you a reset link."}
      </Text>

      {!sent ? (
        <View className="mt-7 gap-3">
          <Input
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={handleSubmit}
          />
          {error ? <Text className="text-[13px] text-crimson">{error}</Text> : null}
          <Button className="w-full" size="lg" disabled={loading} onPress={handleSubmit}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </View>
      ) : (
        <View className="mt-7 rounded-md border border-border bg-surface px-4 py-3">
          <Text className="text-[14px] text-text">
            Sent to <Text className="font-medium">{email}</Text>. Didn't get it? Check spam, or{" "}
            <Text onPress={() => setSent(false)} className="font-medium underline">
              try again
            </Text>
            .
          </Text>
        </View>
      )}

      <Text className="mt-5 text-center text-sm text-muted">
        <TextLink href="/auth/login" className="font-medium text-text underline">
          Back to sign in
        </TextLink>
      </Text>
    </AuthScreen>
  );
}
