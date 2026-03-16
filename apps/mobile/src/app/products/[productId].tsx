import { Stack, useLocalSearchParams, useFocusEffect } from "expo-router";
import React, { useState, useCallback } from "react";
import { ActivityIndicator, TouchableOpacity, View, StyleSheet } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useTrackProductView } from "@/hooks/useMobileTracking";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { createSupabaseClient } from "@ecommerce/shared";

const CART_KEY = "violet_cart_id";
const EDGE_FN_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/cart`
  : null;

/**
 * Gets the current Supabase session access token.
 * Edge Functions require a user JWT, not the project anon key.
 */
async function getSessionToken(): Promise<string | null> {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Mobile product detail screen using Expo Router Stack navigation.
 *
 * Uses `[productId]` dynamic segment convention (Expo Router).
 *
 * ## Data Fetching (placeholder)
 *
 * Currently renders a placeholder screen. Full data fetching will be implemented
 * when Supabase Edge Functions are set up for mobile API access (future story).
 * The web version uses TanStack Start Server Functions which are not available
 * in React Native — mobile needs its own fetch mechanism via Edge Functions.
 *
 * ## Companion Component
 *
 * A fully implemented `MobileProductDetail` component exists at
 * `apps/mobile/src/components/product/ProductDetail.tsx`. It handles:
 * - Horizontal image gallery with `pagingEnabled` swiping
 * - Product info layout (merchant, name, price, description)
 * - "Add to Bag" CTA (placeholder)
 *
 * Once Edge Function data fetching is wired up, replace this placeholder
 * with: `<MobileProductDetail product={data} />`
 *
 * ## Navigation
 *
 * This screen lives under `products/_layout.tsx` (Stack navigator) and is
 * registered in `app-tabs.tsx` with `href: null` to hide it from the tab bar.
 * Users navigate here by pressing a product card in the catalog.
 *
 * @see https://docs.expo.dev/router/reference/dynamic-routes/
 */
export default function ProductDetailScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const [addState, setAddState] = useState<"idle" | "loading" | "added">("idle");

  // Track product view on screen focus (Story 6.2)
  const trackProductView = useTrackProductView(productId);
  useFocusEffect(
    useCallback(() => {
      trackProductView();
    }, [trackProductView]),
  );

  /**
   * Add to cart via the Supabase Edge Function.
   * Creates a new cart if none exists, then adds the product SKU.
   * Stores the violet_cart_id in SecureStore for cross-session persistence.
   *
   * ## sku_id limitation (TODO: fix in mobile product fetch story)
   * `productId` from the route params is a Violet **offer ID**, not a SKU ID.
   * Violet's `POST /checkout/cart/{id}/skus` requires a specific `sku_id` (variant).
   * Until mobile product data fetching is implemented (pending Edge Function wiring),
   * this uses `productId` as a placeholder — it will fail for multi-variant products
   * or if the offer ID != any SKU ID. Full variant selection requires fetching the
   * product's SKUs via `GET /catalog/offers/{id}` first.
   *
   * @see apps/mobile/src/app/products/[productId].tsx — Data Fetching (placeholder) JSDoc
   */
  const handleAddToCart = async () => {
    if (!EDGE_FN_BASE || addState !== "idle") return;
    setAddState("loading");

    try {
      // Use the session access token — Edge Function validates a user JWT, not the anon key
      const token = await getSessionToken();
      if (!token) {
        setAddState("idle");
        return;
      }

      // Get or create cart ID
      let violetCartId = await SecureStore.getItemAsync(CART_KEY);
      if (!violetCartId) {
        const createRes = await fetch(EDGE_FN_BASE, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        if (!createRes.ok) {
          setAddState("idle");
          return;
        }
        const createJson = await createRes.json();
        violetCartId = createJson.data?.violetCartId;
        if (!violetCartId) {
          setAddState("idle");
          return;
        }
        await SecureStore.setItemAsync(CART_KEY, violetCartId);
      }

      // Add product SKU to cart
      // TODO: productId is an offer ID — replace with the actual sku_id once
      // mobile product data fetching is wired up via Edge Function.
      const addRes = await fetch(`${EDGE_FN_BASE}/${violetCartId}/skus`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_id: Number(productId),
          quantity: 1,
          // productName and thumbnailUrl will be populated once real product
          // data fetching is wired up (pending Edge Function integration).
          productName: undefined,
          thumbnailUrl: undefined,
        }),
      });

      setAddState(addRes.ok ? "added" : "idle");
      if (addRes.ok) setTimeout(() => setAddState("idle"), 1500);
    } catch {
      setAddState("idle");
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Product Detail" }} />
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#c9a96e" />
        <ThemedText type="subtitle" style={styles.title}>
          Product Detail
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Product #{productId}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.placeholder}>
          Full product detail coming soon — pending Edge Function integration.
        </ThemedText>

        {/* Add to Cart CTA — wired to Edge Function */}
        <TouchableOpacity
          style={[styles.addBtn, addState !== "idle" && styles.addBtnDisabled]}
          onPress={handleAddToCart}
          disabled={addState === "loading"}
          accessibilityLabel="Add to bag"
          accessibilityState={{ busy: addState === "loading" }}
        >
          <ThemedText style={styles.addBtnText}>
            {addState === "loading" ? "Adding…" : addState === "added" ? "✓ Added!" : "Add to Bag"}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: { fontFamily: "serif" },
  subtitle: { textAlign: "center" },
  placeholder: { textAlign: "center", fontStyle: "italic" },
  addBtn: {
    backgroundColor: "#2c2c2c",
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.five,
    borderRadius: 4,
    marginTop: Spacing.four,
    minWidth: 200,
    alignItems: "center",
  },
  addBtnDisabled: { opacity: 0.7 },
  addBtnText: { color: "#fafaf8", fontWeight: "600", fontSize: 14 },
});
