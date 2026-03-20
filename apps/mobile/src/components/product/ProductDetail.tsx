import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import type { Product, RecommendationItem } from "@ecommerce/shared";
import {
  createSupabaseClient,
  formatPrice,
  stripHtml,
  useRecommendations,
  useUser,
} from "@ecommerce/shared";
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
        <View style={styles.priceRow}>
          <ThemedText type="smallBold" style={styles.price}>
            {priceDisplay}
          </ThemedText>
          {/*
            Uses RN Share.share() directly instead of the shared useShare hook.
            Reason: useShare is web-only — importing react-native in packages/shared
            would break the web build (Vite can't resolve RN modules).
            See packages/shared/src/hooks/useShare.ts JSDoc for full rationale.

            Error handling: try/catch prevents unhandled promise rejections
            when the user denies share permissions or no share provider exists.
            Fixed during Story 7.5 code review.
          */}
          <Pressable
            style={styles.shareBtn}
            onPress={async () => {
              try {
                await Share.share({
                  title: product.name,
                  message: `${product.name} — ${priceDisplay}\nhttps://www.maisonemile.com/products/${product.id}`,
                  url: `https://www.maisonemile.com/products/${product.id}`,
                });
              } catch {
                // User cancelled or share failed — no action needed
              }
            }}
            accessibilityLabel={`Share ${product.name}`}
            accessibilityRole="button"
          >
            <ThemedText style={styles.shareBtnText}>↗</ThemedText>
          </Pressable>
        </View>
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

      {/* Recommendations */}
      <RecommendationsSection productId={product.id} />
    </ScrollView>
  );
}

const CARD_WIDTH = 180;

function RecommendationsSection({ productId }: { productId: string }) {
  const router = useRouter();
  const supabase = createSupabaseClient();
  const { data: user } = useUser();
  const userId = user && !user.is_anonymous ? user.id : undefined;

  const { data, isLoading, isError } = useRecommendations(productId, supabase, userId);

  if (isError) return null;

  if (isLoading) {
    return (
      <View style={styles.recSection}>
        <ThemedText type="subtitle" style={styles.recHeading}>
          You might also like
        </ThemedText>
        <ActivityIndicator size="small" style={styles.recLoader} />
      </View>
    );
  }

  if (!data || data.products.length === 0) return null;

  const renderItem = ({ item }: { item: RecommendationItem }) => (
    <Pressable
      style={styles.recCard}
      onPress={() => router.push(`/products/${item.id}` as never)}
      accessibilityLabel={`${item.name}, ${formatPrice(item.minPrice, item.currency)}`}
    >
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.recImage} />
      ) : (
        <ThemedView type="backgroundElement" style={styles.recImagePlaceholder}>
          <ThemedText themeColor="textSecondary">No image</ThemedText>
        </ThemedView>
      )}
      <ThemedText numberOfLines={2} style={styles.recName}>
        {item.name}
      </ThemedText>
      <ThemedText type="smallBold">{formatPrice(item.minPrice, item.currency)}</ThemedText>
    </Pressable>
  );

  return (
    <View style={styles.recSection}>
      <ThemedText type="subtitle" style={styles.recHeading}>
        You might also like
      </ThemedText>
      <FlatList
        horizontal
        data={data.products}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recList}
      />
    </View>
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
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.one,
  },
  price: {},
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtnText: {
    fontSize: 18,
    lineHeight: 22,
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
  recSection: {
    paddingTop: Spacing.five,
    borderTopWidth: 1,
    borderTopColor: "#e8e4df",
    marginTop: Spacing.four,
    marginHorizontal: Spacing.four,
  },
  recHeading: {
    fontFamily: "serif",
    marginBottom: Spacing.three,
  },
  recLoader: {
    paddingVertical: Spacing.six,
  },
  recList: {
    gap: Spacing.three,
  },
  recCard: {
    width: CARD_WIDTH,
    gap: Spacing.one,
  },
  recImage: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.33,
    borderRadius: 8,
    resizeMode: "cover",
  },
  recImagePlaceholder: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.33,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  recName: {
    fontSize: 13,
    marginTop: Spacing.one,
  },
});
