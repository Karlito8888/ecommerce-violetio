import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import Constants from "expo-constants";
import React, { useCallback, useState } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { StripeProvider } from "@stripe/stripe-react-native";

import { router } from "expo-router";
import { configureEnv, createSupabaseClient, useCartSync } from "@ecommerce/shared";
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
    if (data.screen === "order" && data.order_id) {
      router.push(`/order/${data.order_id}` as never);
    }
  });

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
    <AuthProvider>
      <StripeProvider publishableKey={stripeKey}>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <AppContent />
        </ThemeProvider>
      </StripeProvider>
    </AuthProvider>
  );
}
