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

export default function LoginPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string; error?: string }>();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.error === "auth_callback_failed" ? "That link is invalid or has expired. Please try again." : null
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
      setError(error.message);
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
      <Text className="font-display text-3xl font-semibold text-text">Welcome back</Text>
      <Text className="mt-1.5 text-sm text-muted">Sign in to Enjoy.</Text>

      <View className="mt-7 gap-3">
        <Input
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
        />
        <PasswordInput
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
        />
        <View className="items-end">
          <TextLink href="/auth/forgot-password" className="text-[13px] font-medium text-muted underline">
            Forgot password?
          </TextLink>
        </View>
        {error ? <Text className="text-[13px] text-crimson">{error}</Text> : null}
        <Button className="w-full" size="lg" disabled={loading} onPress={handleSubmit}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </View>

      <Text className="mt-5 text-center text-sm text-muted">
        New here?{" "}
        <TextLink href="/auth/signup" className="font-medium text-text underline">
          Create an account
        </TextLink>
      </Text>
    </AuthScreen>
  );
}
