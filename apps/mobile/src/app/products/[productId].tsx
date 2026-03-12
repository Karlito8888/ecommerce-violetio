import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

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
  title: {
    fontFamily: "serif",
  },
  subtitle: {
    textAlign: "center",
  },
  placeholder: {
    textAlign: "center",
    fontStyle: "italic",
  },
});
