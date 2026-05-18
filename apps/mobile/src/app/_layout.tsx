// apps/mobile/src/app/_layout.tsx
//
// Root layout — wraps the app with required providers.
//
// Migrated from Supabase Auth to Convex Auth (Phase 6).
// Key changes:
//   - Supabase anonymous session initialization removed
//   - onAuthStateChange replaced by Convex Auth (reactive useConvexAuth)
//   - useCartSync (Supabase Realtime) removed — Convex is reactive by default
//   - AuthProvider now uses Convex Auth + localId model
//   - Cart merge logic moved to AuthContext
//
// Retained:
//   - QueryClientProvider (TanStack Query for Violet API data)
//   - StripeProvider (payments)
//   - Theme system
//   - Push notification registration
//   - Exchange rates fetch

import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Linking, View, Text } from "react-native";
import { StripeProvider, useStripe } from "@stripe/stripe-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Colors } from "@/constants/theme";
import { convexTokenStorage } from "@/utils/convexStorage";

import { ThemePreferenceProvider, useThemePreference } from "@/hooks/use-theme-preference";
import { ColorSchemeContext } from "@/hooks/use-color-scheme-context";

const queryClient = new QueryClient();

import { router } from "expo-router";
import { setLiveExchangeRates } from "@ecommerce/shared";
import {
  setupNotificationHandler,
  usePushRegistration,
  useNotificationListeners,
} from "@/hooks/usePushRegistration";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";
import { BiometricPrompt } from "@/components/BiometricPrompt";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { apiGet } from "@/server/apiClient";

// Initialize notification handler at module level (before any component renders).
setupNotificationHandler();

/** Inner component that consumes AuthContext for biometric + push. */
function AppContent() {
  const { isLoading, isAuthenticated, userId, biometricEnabled } = useAuth();
  const [biometricDismissed, setBiometricDismissed] = useState(false);

  // Push notification registration for authenticated users
  usePushRegistration(isAuthenticated && userId ? userId : undefined);
  useNotificationListeners((data) => {
    // Navigate based on push notification data
    const path = data?.path as string | undefined;
    if (path) {
      router.push(path as never);
    }
  });

  // Fetch live exchange rates at startup (fire-and-forget)
  React.useEffect(() => {
    apiGet<{ data?: { rates?: Record<string, number>; date?: string } }>("/api/exchange-rates")
      .then((json) => {
        if (json?.data?.rates && json.data.date) {
          setLiveExchangeRates(json.data.rates, json.data.date);
        }
      })
      .catch(() => {
        // Non-critical: fallback hardcoded rates will be used
      });
  }, []);

  // Show biometric prompt when: user previously logged in with biometric enabled,
  // but current session is not authenticated (app was restarted)
  const showBiometricPrompt =
    !isLoading && biometricEnabled && !isAuthenticated && !biometricDismissed;

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

/**
 * Context for dynamically updating the Stripe publishable key.
 */
const StripeKeyContext = createContext<{
  setStripePublishableKey: (key: string) => void;
}>({ setStripePublishableKey: () => {} });

/** Hook for checkout screen to set the dynamic Stripe key. */
export const useSetStripeKey = () => useContext(StripeKeyContext);

/** Handles deep links from 3D Secure and bank redirect payment methods. */
function StripeDeepLinkHandler() {
  const { handleURLCallback } = useStripe();

  const handleDeepLink = useCallback(
    async (url: string | null) => {
      if (url) {
        await handleURLCallback(url);
      }
    },
    [handleURLCallback],
  );

  useEffect(() => {
    Linking.getInitialURL().then(handleDeepLink);
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });
    return () => subscription.remove();
  }, [handleDeepLink]);

  return null;
}

/** Wraps StripeProvider with a dynamic publishable key. */
function DynamicStripeProvider({
  fallbackKey,
  children,
}: {
  fallbackKey: string;
  children: React.ReactNode;
}) {
  const [dynamicKey, setDynamicKey] = useState(fallbackKey);
  const STRIPE_URL_SCHEME = "mobile";
  const APPLE_MERCHANT_ID = process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID ?? "";

  return (
    <StripeKeyContext.Provider value={{ setStripePublishableKey: setDynamicKey }}>
      <StripeProvider
        publishableKey={dynamicKey}
        urlScheme={STRIPE_URL_SCHEME}
        merchantIdentifier={APPLE_MERCHANT_ID}
      >
        {children as React.ReactElement}
      </StripeProvider>
    </StripeKeyContext.Provider>
  );
}

/**
 * Root layout — wraps the app with required providers.
 *
 * Provider stack (inside-out):
 *   QueryClientProvider (TanStack Query for Violet API data)
 *   ConvexAuthProvider (Convex Auth — useConvexAuth, useAuthActions)
 *   AuthProvider (Mobile auth context — userId, localId, biometric)
 *   DynamicStripeProvider (payments)
 *   ThemePreferenceProvider + ThemeProvider (dark/light)
 */
export default function TabLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemePreferenceProvider>
        <LayoutInner />
      </ThemePreferenceProvider>
    </QueryClientProvider>
  );
}

function LayoutInner() {
  const { resolvedScheme } = useThemePreference();
  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

  // ── Convex client (self-hosted) ───────────────────────────────
  // NOTE: Using useState(() => ...) instead of module-level instantiation
  // (as shown in the Convex React Native Quickstart) because:
  //   1. We check EXPO_PUBLIC_CONVEX_URL availability at render time
  //   2. If missing, we render a fallback error screen instead of crashing
  //   3. The useState initializer runs only once (React guarantee)
  // This matches the self-hosted pattern where the URL may not be
  // configured yet (first dev setup, CI, etc.).
  const [convexClient] = useState(() => {
    const url = process.env.EXPO_PUBLIC_CONVEX_URL;
    if (!url) {
      // eslint-disable-next-line no-console
      console.warn("[Convex] Missing EXPO_PUBLIC_CONVEX_URL");
      return null;
    }
    return new ConvexReactClient(url, {
      unsavedChangesWarning: false,
      skipConvexDeploymentUrlCheck: true, // Self-hosted
    });
  });

  const navigationTheme = useMemo(() => {
    const tokens = resolvedScheme === "dark" ? Colors.dark : Colors.light;
    const base = resolvedScheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: tokens.background,
        card: tokens.background,
        text: tokens.text,
        border: tokens.borderSubtle,
        primary: tokens.accent,
      },
    };
  }, [resolvedScheme]);

  const appContent = (
    <DynamicStripeProvider fallbackKey={stripeKey}>
      <StripeDeepLinkHandler />
      <AuthProvider>
        <ColorSchemeContext.Provider value={resolvedScheme}>
          <ThemeProvider value={navigationTheme}>
            <AppContent />
          </ThemeProvider>
        </ColorSchemeContext.Provider>
      </AuthProvider>
    </DynamicStripeProvider>
  );

  if (!convexClient) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={{ color: "#b54a4a", textAlign: "center", fontSize: 16 }}>
          Configuration error: Missing EXPO_PUBLIC_CONVEX_URL. Please restart the app.
        </Text>
      </View>
    );
  }

  return (
    <ConvexAuthProvider client={convexClient} storage={convexTokenStorage}>
      {appContent}
    </ConvexAuthProvider>
  );
}
