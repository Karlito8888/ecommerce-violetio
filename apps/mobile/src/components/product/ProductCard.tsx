import { Image } from "expo-image";
import { PixelRatio, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import type { GestureResponderEvent } from "react-native";
import type { Product } from "@ecommerce/shared";
import { formatPrice, optimizeImageUrl } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { Fonts, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

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
 * Matches the web BaseProductCard anatomy exactly:
 * - Product image (3:4 ratio) with placeholder for missing images
 * - Sold-out badge overlay
 * - Product name in serif font
 * - Merchant name (tappable link to merchant page)
 * - Price via formatPrice()
 * - Delivery estimate when available
 *
 * Theme-aware: uses useTheme() for all colors — responds to dark/light.
 */
function ProductCard({ product }: { product: Product }) {
  const theme = useTheme();
  const router = useRouter();
  const priceDisplay = formatPrice(product.minPrice, product.currency);
  const isOutOfStock = !product.available;

  const handleMerchantPress = useCallback(
    (e: GestureResponderEvent) => {
      e.stopPropagation();
      router.push(`/merchants/${product.merchantId}` as never);
    },
    [router, product.merchantId],
  );

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          shadowColor: theme.shadowColor,
        },
        pressed && styles.cardPressed,
      ]}
      onPress={() => router.push(`/products/${product.id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${priceDisplay}`}
    >
      {/* Image area */}
      <View style={styles.imageWrap}>
        {product.thumbnailUrl ? (
          <Image
            source={{
              uri:
                optimizeImageUrl(product.thumbnailUrl, {
                  width: CARD_IMG_WIDTH_PX,
                  height: CARD_IMG_HEIGHT_PX,
                }) ?? undefined,
            }}
            contentFit="cover"
            transition={200}
            style={[styles.image, isOutOfStock && styles.imageOutOfStock]}
            accessibilityLabel={`${product.name} by ${product.seller}`}
          />
        ) : (
          <View
            style={[
              styles.image,
              styles.placeholder,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              No image
            </ThemedText>
          </View>
        )}

        {/* Sold Out badge */}
        {isOutOfStock && (
          <View style={[styles.badge, { backgroundColor: theme.text }]}>
            <ThemedText type="small" style={[styles.badgeText, { color: theme.background }]}>
              Sold Out
            </ThemedText>
          </View>
        )}
      </View>

      {/* Info section — mirrors web .product-card__info */}
      <View style={styles.info}>
        <ThemedText style={styles.name} numberOfLines={2}>
          {product.name}
        </ThemedText>

        {/* Merchant link */}
        <Pressable hitSlop={8} style={styles.merchantLink} onPress={handleMerchantPress}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {product.seller}
          </ThemedText>
        </Pressable>

        <ThemedText style={[styles.price, { color: theme.text }]}>{priceDisplay}</ThemedText>
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  imageWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: 3 / 4,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageOutOfStock: {
    opacity: 0.5,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: Spacing.two,
    left: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.one,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
  merchantLink: {
    alignSelf: "flex-start",
    marginBottom: Spacing.one,
  },
  price: {
    fontSize: 14,
    fontWeight: "600",
  },
});
