import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import Constants from "expo-constants";
import React from "react";
import { useColorScheme } from "react-native";

import { configureEnv } from "@ecommerce/shared";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";

const extra = Constants.expoConfig?.extra;
if (extra) {
  configureEnv({
    SUPABASE_URL: extra.supabaseUrl,
    SUPABASE_ANON_KEY: extra.supabaseAnonKey,
  });
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
