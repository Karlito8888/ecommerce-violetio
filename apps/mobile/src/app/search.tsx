import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  StyleSheet,
  TextInput,
  FlatList,
  View,
  ActivityIndicator,
  Pressable,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  useSearch,
  createSupabaseClient,
  formatPrice,
  optimizeWithPreset,
} from "@ecommerce/shared";
import type { ProductMatch } from "@ecommerce/shared";
import { useMobileTracking } from "@/hooks/useMobileTracking";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors, Fonts, Spacing } from "@/constants/theme";

const SUGGESTIONS = [
  "gift for my dad who likes cooking",
  "red dress under $50",
  "running shoes for beginners",
];

/**
 * Mobile search screen (Search tab in bottom navigation).
 *
 * Uses the same `useSearch()` hook from `@ecommerce/shared` as the web app
 * so search behaviour is consistent across platforms.
 *
 * ## M1 code-review fix — Supabase client memoization
 *
 * `createSupabaseClient()` was previously called in the function body,
 * creating a new client on every render. This is wasteful because the
 * Supabase client holds internal state (auth listeners, realtime
 * subscriptions). Wrapping in `useMemo` ensures a single instance per
 * component lifecycle.
 */
export default function SearchScreen() {
  const [query, setQuery] = useState("");

  /** Stable Supabase client — avoids re-creation on every render (M1 fix). */
  const supabase = useMemo(() => createSupabaseClient(), []);
  const { data, isLoading, error } = useSearch({ query }, supabase);

  const products = data?.products ?? [];
  const explanations = data?.explanations ?? {};

  // Track search queries when results load (Story 6.2)
  const { trackEvent } = useMobileTracking();
  const lastTrackedQuery = useRef("");
  useEffect(() => {
    if (!isLoading && query.length >= 2 && query !== lastTrackedQuery.current) {
      lastTrackedQuery.current = query;
      trackEvent({
        event_type: "search",
        payload: { query, result_count: products.length },
      });
    }
  }, [isLoading, query, products.length, trackEvent]);

  const handleProductPress = useCallback((productId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Expo typed routes not yet regenerated
    router.push(`/products/${productId}` as any);
  }, []);

  const handleSuggestionPress = useCallback((suggestion: string) => {
    setQuery(suggestion);
  }, []);

  const renderProduct = useCallback(
    ({ item }: { item: ProductMatch }) => {
      const priceDisplay = formatPrice(item.minPrice, item.currency);
      return (
        <Pressable
          style={styles.card}
          onPress={() => handleProductPress(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${priceDisplay}`}
        >
          {item.thumbnailUrl ? (
            <Image
              source={{ uri: optimizeWithPreset(item.thumbnailUrl, "productCard") ?? undefined }}
              style={[styles.image, !item.available && styles.imageOutOfStock]}
              accessibilityLabel={`${item.name} by ${item.vendor}`}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.image, styles.placeholder]}>
              <ThemedText type="small">No image</ThemedText>
            </View>
          )}
          <View style={styles.info}>
            <ThemedText style={styles.name} numberOfLines={2}>
              {item.name}
            </ThemedText>
            <ThemedText type="small" style={styles.merchant}>
              {item.vendor}
            </ThemedText>
            <ThemedText style={styles.price}>{priceDisplay}</ThemedText>
            {explanations[item.id] && (
              <ThemedText type="small" style={styles.explanation} numberOfLines={2}>
                {explanations[item.id]}
              </ThemedText>
            )}
          </View>
        </Pressable>
      );
    },
    [explanations, handleProductPress],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <TextInput
          style={styles.searchInput}
          placeholder="What are you looking for?"
          placeholderTextColor={Colors.light.textSecondary}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search products"
        />

        {isLoading && query.length >= 2 && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
          </View>
        )}

        {error && query.length >= 2 && (
          <View style={styles.stateContainer}>
            <ThemedText type="subtitle">Something went wrong</ThemedText>
            <ThemedText themeColor="textSecondary">
              We couldn&apos;t complete your search. Please try again.
            </ThemedText>
          </View>
        )}

        {!isLoading && !error && products.length === 0 && query.length >= 2 && (
          <View style={styles.stateContainer}>
            <ThemedText type="subtitle">No results found</ThemedText>
            <ThemedText themeColor="textSecondary">
              Try a different search like &ldquo;red dress under $50&rdquo;
            </ThemedText>
          </View>
        )}

        {!isLoading && !error && products.length > 0 && data?.personalized && (
          <ThemedText type="small" style={styles.personalizationHint}>
            {data.personalizationHint ?? "Results tailored to your preferences"}
          </ThemedText>
        )}

        {!isLoading && !error && products.length > 0 && (
          <FlatList
            data={products}
            renderItem={renderProduct}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {query.length < 2 && !isLoading && (
          <View style={styles.suggestionsContainer}>
            <ThemedText type="small" style={styles.suggestionsLabel}>
              Try searching for:
            </ThemedText>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => handleSuggestionPress(s)} style={styles.suggestion}>
                <ThemedText themeColor="textSecondary" style={styles.suggestionText}>
                  &ldquo;{s}&rdquo;
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    paddingTop: Spacing.six,
  },
  searchInput: {
    height: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 24,
    backgroundColor: Colors.light.backgroundElement,
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: Spacing.three,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  stateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  listContent: {
    paddingBottom: Spacing.six,
  },
  card: {
    flexDirection: "row",
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: Spacing.two,
    overflow: "hidden",
    marginBottom: Spacing.two,
  },
  image: {
    width: 100,
    height: 130,
  },
  imageOutOfStock: {
    opacity: 0.5,
  },
  placeholder: {
    backgroundColor: Colors.light.backgroundSelected,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    padding: Spacing.two,
    justifyContent: "center",
  },
  name: {
    fontFamily: Fonts?.serif ?? "serif",
    fontSize: 15,
    fontWeight: "500",
    marginBottom: Spacing.half,
  },
  merchant: {
    color: Colors.light.textSecondary,
    marginBottom: Spacing.one,
  },
  price: {
    fontSize: 14,
    fontWeight: "600",
  },
  explanation: {
    marginTop: Spacing.one,
    fontStyle: "italic",
    color: Colors.light.textSecondary,
  },
  personalizationHint: {
    color: Colors.light.textSecondary,
    fontStyle: "italic",
    paddingHorizontal: Spacing.one,
    marginBottom: Spacing.two,
  },
  suggestionsContainer: {
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  suggestionsLabel: {
    fontWeight: "600",
    marginBottom: Spacing.one,
  },
  suggestion: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: Spacing.two,
  },
  suggestionText: {
    fontSize: 14,
  },
});
