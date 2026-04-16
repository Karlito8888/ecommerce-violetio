import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import Constants from "expo-constants";
import React, { createContext, useCallback, useContext, useState } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { StripeProvider } from "@stripe/stripe-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

const VIOLET_CART_KEY = "violet_cart_id";

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

  // Fetch live exchange rates from Violet at startup (fire-and-forget).
  // Falls back to hardcoded rates if the API is unavailable.
  React.useEffect(() => {
    const supabaseUrl =
      Constants.expoConfig?.extra?.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
    fetch(`${supabaseUrl}/functions/v1/get-exchange-rates`)
      .then((res) => (res.ok ? res.json() : null))
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
    SecureStore.getItemAsync(VIOLET_CART_KEY).then(setCurrentVioletCartId);
  }, [_cartSyncTrigger]);

  const handleCartUpdated = useCallback(() => {
    // Trigger re-render so screens refetch cart data on next render
    setCartSyncTrigger((prev) => prev + 1);
  }, []);

  const handleRemoteCartChange = useCallback(async (newVioletCartId: string) => {
    await SecureStore.setItemAsync(VIOLET_CART_KEY, newVioletCartId);
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

  return (
    <StripeKeyContext.Provider value={{ setStripePublishableKey: setDynamicKey }}>
      <StripeProvider publishableKey={dynamicKey}>{children as React.ReactElement}</StripeProvider>
    </StripeKeyContext.Provider>
  );
}

/**
 * Root layout — wraps the app with required providers.
 *
 * ## StripeProvider (Story 4.4)
 * Wraps the entire app so that `useStripe()` hooks work in the checkout screen.
 * Uses `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` from the environment — this is the
 * Stripe publishable key (pk_test_... or pk_live_...), safe for client-side use.
 *
 * @see https://stripe.com/docs/payments/accept-a-payment?platform=react-native
 */
export default function TabLayout() {
  const colorScheme = useColorScheme();
  const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DynamicStripeProvider fallbackKey={stripeKey}>
          <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            <AppContent />
          </ThemeProvider>
        </DynamicStripeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
