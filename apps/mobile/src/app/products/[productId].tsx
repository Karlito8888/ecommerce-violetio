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
 * Resolves a Violet offer ID to its first available SKU ID.
 *
 * Violet's cart API requires a SKU id (the purchasable variant), not an offer id
 * (the product listing). This calls GET /cart/offers/{offerId} which fetches
 * the offer from Violet server-side and returns the first available SKU id.
 *
 * @see supabase/functions/cart/index.ts — GET /offers/{offerId} route
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
 */
async function resolveSkuId(
  offerId: string,
  token: string,
): Promise<{ skuId: string; name: string } | null> {
  if (!EDGE_FN_BASE) return null;
  try {
    const res = await fetch(`${EDGE_FN_BASE}/offers/${offerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const data = json.data as { skuId: string | null; name: string } | null;
    if (!data?.skuId) return null;
    return { skuId: data.skuId, name: data.name };
  } catch {
    return null;
  }
}

/**
 * Mobile product detail screen using Expo Router Stack navigation.
 *
 * Uses `[productId]` dynamic segment convention (Expo Router).
 *
 * ## Data Fetching (placeholder)
 *
 * Currently renders a placeholder screen. Full product data fetching will be
 * wired up in a future story via `GET /catalog/offers/{id}` through an Edge Function.
 * The web version uses TanStack Start Server Functions which are not available
 * in React Native — mobile needs its own fetch mechanism via Edge Functions.
 *
 * ## Add to Bag — SKU resolution
 *
 * Violet requires a sku_id (not an offer_id) for POST /checkout/cart/{id}/skus.
 * This screen calls `GET /cart/offers/{offerId}` first to resolve the first
 * available SKU id, then uses it to add the item to cart.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
 * @see https://docs.violet.io/prism/catalog/skus — SKU fields: id, available, status
 */
export default function ProductDetailScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const [addState, setAddState] = useState<"idle" | "loading" | "added" | "error">("idle");
  const [productName, setProductName] = useState<string | null>(null);

  // Track product view on screen focus (Story 6.2)
  const trackProductView = useTrackProductView(productId);
  useFocusEffect(
    useCallback(() => {
      trackProductView();
    }, [trackProductView]),
  );

  /**
   * Add to cart via the Supabase Edge Function.
   *
   * Flow:
   * 1. Get session token
   * 2. Resolve offer ID → first available SKU id via GET /cart/offers/{offerId}
   * 3. Get or create Violet cart
   * 4. POST sku_id to /cart/{cartId}/skus
   */
  const handleAddToCart = async () => {
    if (!EDGE_FN_BASE || addState !== "idle") return;
    setAddState("loading");

    try {
      const token = await getSessionToken();
      if (!token) {
        setAddState("idle");
        return;
      }

      // Step 1: Resolve offer ID → first available SKU id
      const resolved = await resolveSkuId(productId, token);
      if (!resolved) {
        setAddState("error");
        setTimeout(() => setAddState("idle"), 2000);
        return;
      }
      if (resolved.name && !productName) setProductName(resolved.name);

      // Step 2: Get or create cart
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

      // Step 3: Add SKU to cart using the resolved sku_id
      const addRes = await fetch(`${EDGE_FN_BASE}/${violetCartId}/skus`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_id: Number(resolved.skuId),
          quantity: 1,
          productName: resolved.name,
        }),
      });

      setAddState(addRes.ok ? "added" : "error");
      if (addRes.ok) setTimeout(() => setAddState("idle"), 1500);
      else setTimeout(() => setAddState("idle"), 2000);
    } catch {
      setAddState("idle");
    }
  };

  const btnLabel =
    addState === "loading"
      ? "Adding…"
      : addState === "added"
        ? "✓ Added!"
        : addState === "error"
          ? "Failed — retry"
          : "Add to Bag";

  return (
    <>
      <Stack.Screen options={{ title: productName ?? "Product Detail" }} />
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#c9a96e" />
        <ThemedText type="subtitle" style={styles.title}>
          {productName ?? "Product Detail"}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.subtitle}>
          Product #{productId}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.placeholder}>
          Full product detail coming soon — pending Edge Function integration.
        </ThemedText>

        <TouchableOpacity
          style={[styles.addBtn, addState !== "idle" && styles.addBtnDisabled]}
          onPress={handleAddToCart}
          disabled={addState === "loading"}
          accessibilityLabel="Add to bag"
          accessibilityState={{ busy: addState === "loading" }}
        >
          <ThemedText style={styles.addBtnText}>{btnLabel}</ThemedText>
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
