import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FadeIn } from "@/components/ui/FadeIn";

// Centered, keyboard-aware column used by every auth screen — the native
// counterpart of `flex min-h-dvh flex-col justify-center px-6 fade-in`.
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24 }}
        >
          <FadeIn>{children}</FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
