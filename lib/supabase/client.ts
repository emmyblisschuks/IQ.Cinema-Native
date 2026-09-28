import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// One client for the whole app, not one per call. Hooks put the client in
// effect dependency arrays; a stable identity keeps those effects from
// tearing down and re-firing every render (same reason the web app returns a
// singleton).
let client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (!client) {
    client = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // Native has no URL bar to parse a session out of; deep links are
        // handled explicitly in app/auth/callback.tsx.
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });

    // Tokens only auto-refresh while the app is in the foreground.
    AppState.addEventListener("change", (state) => {
      if (state === "active") client!.auth.startAutoRefresh();
      else client!.auth.stopAutoRefresh();
    });
  }
  return client;
}
