// app/auth/signup.tsx

import { useState } from "react";
import { View } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { AuthScreen } from "@/components/auth/AuthScreen";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Set once signUp() succeeds but there's no session yet — i.e. email
  // confirmation is required and the account isn't usable until they tap
  // the link.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit() {
    if (loading) return;
    if (!username.trim() || !email.trim() || !password) {
      setError("Fill in every field.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: username.trim() },
        // Deep link back into the app (scheme `iqcinema`). Add
        // `iqcinema://auth/callback` to the Supabase Auth redirect allow-list.
        emailRedirectTo: Linking.createURL("/auth/callback", { queryParams: { next: "/" } }),
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // profiles row is created automatically by a DB trigger on auth.users —
    // no client-side insert needed (and RLS wouldn't allow one anyway).

    if (data.session) {
      // Email confirmation is off, or this project auto-confirms — already signed in.
      router.replace("/");
      return;
    }

    setAwaitingConfirmation(true);
  }

  async function handleResend() {
    setResending(true);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    setResending(false);
    if (!resendError) setResent(true);
  }

  if (awaitingConfirmation) {
    return (
      <AuthScreen>
        <Text className="font-display text-3xl font-semibold text-text">Check your email</Text>
        <Text className="mt-1.5 text-sm text-muted">
          We sent a confirmation link to <Text className="font-medium text-text">{email}</Text>. Tap it to finish
          creating your account.
        </Text>
        <View className="mt-7 gap-3">
          <Button variant="secondary" className="w-full" size="lg" disabled={resending || resent} onPress={handleResend}>
            {resent ? "Sent!" : resending ? "Resending…" : "Resend email"}
          </Button>
          <Text className="text-center text-sm text-muted">
            <TextLink href="/auth/login" className="font-medium text-text underline">
              Back to sign in
            </TextLink>
          </Text>
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <Text className="font-display text-3xl font-semibold text-text">Create your account</Text>
      <Text className="mt-1.5 text-sm text-muted">Join IQ Cinema — free to watch, free to sign up.</Text>

      <View className="mt-7 gap-3">
        <Input
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
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
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
        />
        {error ? <Text className="text-[13px] text-crimson">{error}</Text> : null}
        <Button className="w-full" size="lg" disabled={loading} onPress={handleSubmit}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </View>

      <Text className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <TextLink href="/auth/login" className="font-medium text-text underline">
          Sign in
        </TextLink>
      </Text>
    </AuthScreen>
  );
}
