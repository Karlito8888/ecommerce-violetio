import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import Constants from "expo-constants";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Linking } from "react-native";
import { StripeProvider, useStripe } from "@stripe/stripe-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Colors } from "@/constants/theme";
import { CART_STORAGE_KEY } from "@/constants/cart";

import { ThemePreferenceProvider, useThemePreference } from "@/hooks/use-theme-preference";
import { ColorSchemeContext } from "@/hooks/use-color-scheme-context";

const queryClient = new QueryClient();

import { router } from "expo-router";
import {
  configureEnv,
  createSupabaseClient,
  useCartSync,
  mobilePushDataToPath,
  setLiveExchangeRates,
} from "@ecommerce/shared";
import {
  setupNotificationHandler,
  usePushRegistration,
  useNotificationListeners,
} from "@/hooks/usePushRegistration";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import AppTabs from "@/components/app-tabs";
import { BiometricPrompt } from "@/components/BiometricPrompt";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { initSupabaseMobile } from "@/utils/authInit";
import { apiGet } from "@/server/apiClient";

// Configure environment variables and Supabase client (with SecureStore) at module load.
// Must run before any Supabase usage — order matters.
const extra = Constants.expoConfig?.extra;
if (extra) {
  configureEnv({
    SUPABASE_URL: extra.supabaseUrl,
    SUPABASE_ANON_KEY: extra.supabaseAnonKey,
  });
}

// Guard against missing SUPABASE_ANON_KEY (e.g. .env.local not loaded).
// Without this, the app crashes with a Red Box before even rendering.
try {
  initSupabaseMobile();
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  // eslint-disable-next-line no-console
  console.warn("[Auth] Supabase init failed:", msg);
}

// Initialize notification handler at module level (before any component renders).
// Controls how foreground notifications are displayed.
setupNotificationHandler();

// Supabase client singleton — created once outside the render cycle to maintain
// referential stability. Prevents useCartSync from re-subscribing on every render.
const supabaseClient = createSupabaseClient();

/** Inner component that consumes AuthContext to conditionally show BiometricPrompt. */
function AppContent() {
  const { isLoading, user, isAnonymous, biometricEnabled } = useAuth();
  const [biometricDismissed, setBiometricDismissed] = useState(false);
  const [_cartSyncTrigger, setCartSyncTrigger] = useState(0);

  // Push notification registration for authenticated users (Story 6.7)
  const pushUserId = user && !isAnonymous ? user.id : undefined;
  usePushRegistration(pushUserId);
  useNotificationListeners((data) => {
    const path = mobilePushDataToPath(data);
    if (path) {
      router.push(path as never);
    }
  });

  // Fetch live exchange rates from the web backend at startup (fire-and-forget).
  // Falls back to hardcoded rates if the API is unavailable.
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

  // Cross-device cart sync via Supabase Realtime (Story 4.6)
  const syncUserId = user && !isAnonymous ? user.id : null;
  // Read current violet cart ID from SecureStore (async, but useCartSync handles null)
  const [currentVioletCartId, setCurrentVioletCartId] = useState<string | null>(null);
  React.useEffect(() => {
    SecureStore.getItemAsync(CART_STORAGE_KEY).then(setCurrentVioletCartId);
  }, [_cartSyncTrigger]);

  const handleCartUpdated = useCallback(() => {
    // Trigger re-render so screens refetch cart data on next render
    setCartSyncTrigger((prev) => prev + 1);
  }, []);

  const handleRemoteCartChange = useCallback(async (newVioletCartId: string) => {
    await SecureStore.setItemAsync(CART_STORAGE_KEY, newVioletCartId);
    setCurrentVioletCartId(newVioletCartId);
    setCartSyncTrigger((prev) => prev + 1);
  }, []);

  useCartSync({
    supabase: supabaseClient,
    userId: syncUserId,
    currentVioletCartId,
    onCartUpdated: handleCartUpdated,
    onRemoteCartChange: handleRemoteCartChange,
  });

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

/**
 * Context for dynamically updating the Stripe publishable key.
 *
 * In Violet Demo/Test Mode, PaymentIntents are created on Violet's Stripe account.
 * The local `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` won't match — PaymentSheet fails.
 * The checkout screen calls `setStripePublishableKey()` with the `stripe_key` from
 * Violet's cart response, and `StripeProvider` re-initializes with the correct key.
 *
 * Falls back to the environment key if never updated.
 */
const StripeKeyContext = createContext<{
  setStripePublishableKey: (key: string) => void;
}>({ setStripePublishableKey: () => {} });

/** Hook for checkout screen to set the dynamic Stripe key. */
export const useSetStripeKey = () => useContext(StripeKeyContext);

/**
 * Handles deep links from 3D Secure and bank redirect payment methods.
 *
 * Stripe requires forwarding redirect URLs back to the SDK so it can
 * auto-dismiss web views used for authentication (e.g. 3DS1 redirects).
 * Without this, payment methods that require a redirect (bank debits,
 * some European 3DS flows) will silently fail.
 *
 * Must render inside <StripeProvider> to access `handleURLCallback`.
 *
 * @see https://docs.stripe.com/payments/accept-a-payment?platform=react-native
 */
function StripeDeepLinkHandler() {
  const { handleURLCallback } = useStripe();

  const handleDeepLink = useCallback(
    async (url: string | null) => {
      if (url) {
        const stripeHandled = await handleURLCallback(url);
        if (stripeHandled) {
          // Stripe handled the URL — 3DS/bank redirect completed
        }
        // Non-Stripe URLs are handled by expo-router normally
      }
    },
    [handleURLCallback],
  );

  useEffect(() => {
    // Handle app opened from a deep link while cold-starting
    Linking.getInitialURL().then(handleDeepLink);

    // Handle app opened from a deep link while running
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    return () => subscription.remove();
  }, [handleDeepLink]);

  return null;
}

/**
 * Wraps `StripeProvider` with a dynamic publishable key.
 *
 * When the checkout screen fetches the cart and finds a `stripePublishableKey`
 * from Violet, it calls `useSetStripeKey().setStripePublishableKey(key)`.
 * This updates the StripeProvider's `publishableKey` prop, causing it to
 * re-initialize with the correct key for the PaymentIntent.
 */
function DynamicStripeProvider({
  fallbackKey,
  children,
}: {
  fallbackKey: string;
  children: React.ReactNode;
}) {
  const [dynamicKey, setDynamicKey] = useState(fallbackKey);

  // "mobile" is the URL scheme defined in app.config.ts (scheme: "mobile").
  // Required by Stripe for 3D Secure redirects and bank redirect payment methods.
  // @see https://docs.stripe.com/payments/accept-a-payment?platform=react-native
  const STRIPE_URL_SCHEME = "mobile";

  // Apple Merchant ID from Apple Developer portal, configured via env var.
  // Required by StripeProvider to initialize the native Stripe SDK with Apple Pay support.
  // Also configured in app.config.ts plugin for the iOS entitlements (Info.plist), but
  // the JS SDK needs it separately for NativeStripeSdk.initialise() on iOS.
  // @see https://docs.stripe.com/apple-pay?platform=react-native — "Set your Apple Merchant ID in StripeProvider"
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
 * ## Theme system (mirrors web dark/light mode)
 * ThemePreferenceProvider handles user preference + persistence.
 * ColorSchemeContext provides the resolved scheme to useColorScheme().
 * React Navigation ThemeProvider switches between DarkTheme/DefaultTheme.
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

  // Extend React Navigation themes with our design tokens.
  // This sets the background, card, text, border, and primary colors for ALL screens
  // (Tabs + nested Stacks) — no need to set backgroundColor per-screen or per-layout.
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

  return (
    <AuthProvider>
      <DynamicStripeProvider fallbackKey={stripeKey}>
        <StripeDeepLinkHandler />
        <ColorSchemeContext.Provider value={resolvedScheme}>
          <ThemeProvider value={navigationTheme}>
            <AppContent />
          </ThemeProvider>
        </ColorSchemeContext.Provider>
      </DynamicStripeProvider>
    </AuthProvider>
  );
}
