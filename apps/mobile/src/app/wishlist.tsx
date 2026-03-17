import React from "react";
import { StyleSheet, FlatList, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useWishlist, useRemoveFromWishlist, useUser } from "@ecommerce/shared";
import type { WishlistItem } from "@ecommerce/shared";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors, Fonts, Spacing } from "@/constants/theme";

/**
 * Wishlist screen for authenticated users (Story 6.4).
 *
 * ## Placeholder product names
 * Currently shows `Product {id}` since fetching live Violet data per item
 * on mobile requires a dedicated Edge Function (not built in this story).
 * Future story can add `useQueries` with product detail fetch (like web).
 */
export default function WishlistScreen() {
  const { data: user } = useUser();
  const userId = user && !user.is_anonymous ? user.id : undefined;
  const wishlist = useWishlist(userId);
  const removeMutation = useRemoveFromWishlist(userId ?? "");

  const items = wishlist.data?.items ?? [];
  const isEmpty = items.length === 0;

  if (!userId) {
    return (
      <SafeAreaView style={styles.container}>
        <ThemedView style={styles.empty}>
          <ThemedText style={styles.emptyMessage}>
            Sign in to save your favorite products
          </ThemedText>
          <Pressable style={styles.cta} onPress={() => router.push("/auth" as never)}>
            <ThemedText style={styles.ctaText}>Sign In</ThemedText>
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: WishlistItem }) => (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/products/${item.product_id}` as never)}
    >
      <View style={styles.cardImage}>
        <ThemedText style={styles.heartPlaceholder}>{"\u2661"}</ThemedText>
      </View>
      <View style={styles.cardInfo}>
        <ThemedText style={styles.cardName} numberOfLines={2}>
          Product {item.product_id}
        </ThemedText>
        <Pressable style={styles.removeBtn} onPress={() => removeMutation.mutate(item.product_id)}>
          <ThemedText style={styles.removeText}>Remove</ThemedText>
        </Pressable>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText style={styles.heading}>My Wishlist</ThemedText>

      {isEmpty ? (
        <ThemedView style={styles.empty}>
          <ThemedText style={styles.emptyMessage}>Your wishlist is empty</ThemedText>
          <Pressable style={styles.cta} onPress={() => router.push("/" as never)}>
            <ThemedText style={styles.ctaText}>Discover products</ThemedText>
          </Pressable>
        </ThemedView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  heading: {
    fontFamily: Fonts.serif,
    fontSize: 24,
    fontWeight: "600",
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.two,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.six,
  },
  emptyMessage: {
    fontSize: 18,
    fontFamily: Fonts.serif,
    color: Colors.light.textSecondary,
    marginBottom: Spacing.three,
    textAlign: "center",
  },
  cta: {
    backgroundColor: Colors.light.tint,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 8,
  },
  ctaText: {
    color: Colors.light.buttonText,
    fontWeight: "600",
    fontSize: 15,
  },
  list: {
    padding: Spacing.three,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: Spacing.three,
  },
  card: {
    width: "48%",
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: 12,
    overflow: "hidden",
  },
  cardImage: {
    aspectRatio: 3 / 4,
    backgroundColor: Colors.light.backgroundSelected,
    justifyContent: "center",
    alignItems: "center",
  },
  heartPlaceholder: {
    fontSize: 40,
    color: Colors.light.textSecondary,
  },
  cardInfo: {
    padding: Spacing.two,
  },
  cardName: {
    fontFamily: Fonts.serif,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: Spacing.one,
  },
  removeBtn: {
    marginTop: Spacing.one,
  },
  removeText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    textDecorationLine: "underline",
  },
});
