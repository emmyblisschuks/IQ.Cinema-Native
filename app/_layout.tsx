// app/_layout.tsx

import "../global.css";
import "react-native-url-polyfill/auto";
import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { vars } from "nativewind";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_600SemiBold_Italic,
  useFonts,
} from "@expo-google-fonts/fraunces";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { BottomNav } from "@/components/shared/BottomNav";
import { NavChromeProvider } from "@/hooks/useNavChrome";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const { tokens, isDark, colors, ready } = useTheme();
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_600SemiBold_Italic,
  });

  useEffect(() => {
    if (fontsLoaded && ready) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, ready]);

  if (!fontsLoaded || !ready) return null;

  return (
    // vars() publishes the design tokens as CSS variables, which is what makes
    // every `bg-bg` / `text-muted` / `border-border` class theme-aware.
    <View style={[{ flex: 1 }, vars(tokens)]} className="bg-bg">
      <StatusBar style={isDark ? "light" : "dark"} />
      <AuthProvider>
       <NavChromeProvider>
        <View className="w-full max-w-md flex-1 self-center bg-bg">
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: "fade",
            }}
          />
        </View>
        <BottomNav />
       </NavChromeProvider>
      </AuthProvider>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Shell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
