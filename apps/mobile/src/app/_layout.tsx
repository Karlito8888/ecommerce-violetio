import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import Constants from "expo-constants";
import React, { useState } from "react";
import { useColorScheme } from "react-native";

import { configureEnv } from "@ecommerce/shared";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";
import { BiometricPrompt } from "@/components/BiometricPrompt";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { initSupabaseMobile } from "@/utils/authInit";

// Configure environment variables and Supabase client (with SecureStore) at module load.
// Must run before any Supabase usage — order matters.
const extra = Constants.expoConfig?.extra;
if (extra) {
  configureEnv({
    SUPABASE_URL: extra.supabaseUrl,
    SUPABASE_ANON_KEY: extra.supabaseAnonKey,
  });
}
initSupabaseMobile();

/** Inner component that consumes AuthContext to conditionally show BiometricPrompt. */
function AppContent() {
  const { isLoading, user, isAnonymous, biometricEnabled } = useAuth();
  const [biometricDismissed, setBiometricDismissed] = useState(false);

  // Show biometric prompt when: user previously logged in with biometric enabled,
  // but current session is anonymous (app was restarted)
  const showBiometricPrompt =
    !isLoading && biometricEnabled && (isAnonymous || !user) && !biometricDismissed;

  if (showBiometricPrompt) {
    return <BiometricPrompt onFallbackToPassword={() => setBiometricDismissed(true)} />;
  }

  return (
    <>
      <AnimatedSplashOverlay />
      <AppTabs />
    </>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  );
}
