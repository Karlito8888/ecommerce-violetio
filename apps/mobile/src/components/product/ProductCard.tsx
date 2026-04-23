import { Image, PixelRatio, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import React from "react";
import type { Product } from "@ecommerce/shared";
import { formatPrice, optimizeImageUrl } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { Link } from "expo-router";

/**
 * Product card image dimensions adjusted for device pixel ratio.
 *
 * On a 3x device, a card ~180pt wide needs ~540 physical pixels
 * for crisp rendering. The Shopify CDN will resize server-side.
 */
const CARD_IMG_WIDTH_PX = Math.min(Math.round(200 * PixelRatio.get()), 800);
const CARD_IMG_HEIGHT_PX = Math.round(CARD_IMG_WIDTH_PX * (4 / 3));

/**
 * Native product card for the mobile catalog grid.
 *
 * Matches the web ProductCard anatomy:
 * - Product image (3:4 ratio) with placeholder for missing images
 * - Product name in serif font
 * - Merchant name in secondary text
 * - Price via formatPrice() (cents → localized currency string)
 *
 * Uses React Native StyleSheet with design tokens from theme constants.
 */
function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const priceDisplay = formatPrice(product.minPrice, product.currency);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(`/products/${product.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${priceDisplay}`}
    >
      {product.thumbnailUrl ? (
        <Image
          source={{
            uri:
              optimizeImageUrl(product.thumbnailUrl, {
                width: CARD_IMG_WIDTH_PX,
                height: CARD_IMG_HEIGHT_PX,
              }) ?? undefined,
          }}
          style={[styles.image, !product.available && styles.imageOutOfStock]}
          accessibilityLabel={`${product.name} by ${product.seller}`}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <ThemedText type="small">No image</ThemedText>
        </View>
      )}

      {!product.available && (
        <View style={styles.badge}>
          <ThemedText type="small" style={styles.badgeText}>
            Sold Out
          </ThemedText>
        </View>
      )}

      <View style={styles.info}>
        <ThemedText style={styles.name} numberOfLines={2}>
          {product.name}
        </ThemedText>
        <Link
          href={`/merchants/${product.merchantId}`}
          asChild
          onPress={(e) => e.stopPropagation()}
        >
          <Pressable hitSlop={8} style={styles.merchantLink}>
            <ThemedText type="small" style={styles.merchant}>
              {product.seller}
            </ThemedText>
          </Pressable>
        </Link>
        <ThemedText style={styles.price}>{priceDisplay}</ThemedText>
      </View>
    </Pressable>
  );
}

export default React.memo(ProductCard);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: Spacing.one,
    borderRadius: Spacing.two,
    overflow: "hidden",
    backgroundColor: Colors.light.backgroundElement,
  },
  image: {
    width: "100%",
    aspectRatio: 3 / 4,
  },
  imageOutOfStock: {
    opacity: 0.5,
  },
  placeholder: {
    backgroundColor: Colors.light.backgroundSelected,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: Spacing.two,
    left: Spacing.two,
    backgroundColor: Colors.light.text,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.one,
  },
  badgeText: {
    color: Colors.light.background,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  info: {
    padding: Spacing.two,
  },
  name: {
    fontFamily: Fonts?.serif ?? "serif",
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 20,
    marginBottom: Spacing.half,
  },
  merchant: {
    color: Colors.light.textSecondary,
    marginBottom: Spacing.one,
  },
  merchantLink: {
    alignSelf: "flex-start",
  },
  price: {
    fontSize: 14,
    fontWeight: "600",
  },
  cardPressed: {
    opacity: 0.75,
  },
});
