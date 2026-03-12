import React from "react";
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";

import type { Product } from "@ecommerce/shared";
import { formatPrice, stripHtml } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";

/**
 * Screen width for responsive image sizing.
 *
 * ## Why not a fixed 400px?
 *
 * Mobile devices range from 320px (iPhone SE) to 430px+ (iPhone Pro Max)
 * and beyond on tablets. Using `Dimensions.get('window').width` ensures
 * the hero image fills the screen width on any device. For horizontal
 * paging (`pagingEnabled`), each image must be exactly one screen wide
 * so the snap-to-page behavior works correctly.
 */
const SCREEN_WIDTH = Dimensions.get("window").width;

/**
 * Mobile product detail layout (React Native).
 *
 * Stacked layout: full-width hero image → product info → description.
 * Image gallery uses a horizontal ScrollView with `pagingEnabled` for swiping.
 *
 * ## Data Fetching (placeholder)
 *
 * This component is fully implemented but not yet wired to the mobile screen
 * (`[productId].tsx`) because data fetching requires Supabase Edge Functions
 * which are a future story. The screen currently shows a placeholder.
 *
 * ## Violet.io Image Handling
 *
 * Images from `product.images[]` are CDN URLs from merchant platforms.
 * Sorted by `displayOrder` for consistent gallery ordering.
 * Alt text follows the pattern: `"${name} - Image N of M"`.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
 */
export default function MobileProductDetail({ product }: { product: Product }) {
  const images = [...product.images].sort((a, b) => a.displayOrder - b.displayOrder);
  const isAvailable = product.available;
  const priceDisplay = formatPrice(product.minPrice, product.currency);

  /** Safe plain-text description — HTML stripped via shared `stripHtml` utility. */
  const plainDescription = stripHtml(product.htmlDescription ?? product.description);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Image Gallery — horizontal swipe */}
      {images.length > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.gallery}
        >
          {images.map((img, i) => (
            <Image
              key={img.id}
              source={{ uri: img.url }}
              style={styles.heroImage}
              accessibilityLabel={`${product.name} - Image ${i + 1} of ${images.length}`}
            />
          ))}
        </ScrollView>
      ) : (
        <ThemedView type="backgroundElement" style={styles.placeholder}>
          <ThemedText themeColor="textSecondary">No image available</ThemedText>
        </ThemedView>
      )}

      {/* Product Info */}
      <View style={styles.info}>
        <ThemedText type="small" themeColor="textSecondary">
          {product.seller}
        </ThemedText>
        <ThemedText type="subtitle" style={styles.name}>
          {product.name}
        </ThemedText>
        <ThemedText type="smallBold" style={styles.price}>
          {priceDisplay}
        </ThemedText>
      </View>

      {/* Description */}
      <View style={styles.description}>
        <ThemedText>{plainDescription}</ThemedText>
      </View>

      {/* CTA */}
      <View style={styles.ctaWrap}>
        <Pressable
          style={[styles.cta, !isAvailable && styles.ctaDisabled]}
          disabled={!isAvailable}
          onPress={() => {
            // TODO: Story 4.1 — Cart API integration
          }}
        >
          <ThemedText style={styles.ctaText}>
            {isAvailable ? "Add to Bag" : "Notify When Available"}
          </ThemedText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.six,
  },
  gallery: {
    height: 400,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    resizeMode: "cover",
  },
  placeholder: {
    height: 300,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    padding: Spacing.four,
    gap: Spacing.one,
  },
  name: {
    fontFamily: "serif",
  },
  price: {
    marginTop: Spacing.one,
  },
  description: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  ctaWrap: {
    padding: Spacing.four,
    paddingTop: Spacing.five,
  },
  cta: {
    backgroundColor: "#c9a96e",
    paddingVertical: Spacing.three,
    borderRadius: 8,
    alignItems: "center",
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    color: "#2c2c2c",
    fontWeight: "600",
    fontSize: 16,
  },
});
