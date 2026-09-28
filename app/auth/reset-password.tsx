// app/auth/reset-password.tsx

import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Text } from "@/components/ui/Text";
import { AuthScreen } from "@/components/auth/AuthScreen";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

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
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    setTimeout(() => router.replace("/"), 1500);
  }

  if (checking) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <Text className="text-[14px] text-muted">Checking your link…</Text>
      </View>
    );
  }

  if (!hasSession) {
    return (
      <AuthScreen>
        <Text className="font-display text-3xl font-semibold text-text">Link expired</Text>
        <Text className="mt-1.5 text-sm text-muted">
          This password reset link is invalid or has expired. Request a new one to continue.
        </Text>
        <Button className="mt-7 w-full" size="lg" onPress={() => router.replace("/auth/forgot-password")}>
          Request a new link
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <Text className="font-display text-3xl font-semibold text-text">Set a new password</Text>
      <Text className="mt-1.5 text-sm text-muted">Choose something you haven't used before.</Text>

      {done ? (
        <View className="mt-7 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-4 py-3">
          <Text className="text-[14px] text-emerald-500">Password updated — signing you in…</Text>
        </View>
      ) : (
        <View className="mt-7 gap-3">
          <PasswordInput
            placeholder="New password"
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
          />
          <PasswordInput
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onSubmitEditing={handleSubmit}
          />
          {error ? <Text className="text-[13px] text-crimson">{error}</Text> : null}
          <Button className="w-full" size="lg" disabled={loading} onPress={handleSubmit}>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </View>
      )}
    </AuthScreen>
  );
}
