// app/auth/callback.tsx
//
// Every Supabase auth email link (signup confirmation, password recovery)
// deep-links here (iqcinema://auth/callback?code=…&next=…) with a `code` that
// must be exchanged for a session. This is the native counterpart of the web
// app's app/auth/callback/route.ts.

import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallback() {
  const router = useRouter();
  const { code, next } = useLocalSearchParams<{ code?: string; next?: string }>();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      if (code) {
        const { error } = await createClient().auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace(dest as never);
          return;
        }
      }
      router.replace("/auth/login?error=auth_callback_failed");
    })();
  }, [code, next, router]);

  return (
    <View className="flex-1 items-center justify-center bg-bg">
      <ActivityIndicator />
    </View>
  );
}
