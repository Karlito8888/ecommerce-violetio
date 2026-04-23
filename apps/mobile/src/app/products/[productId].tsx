import { Stack, useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import React, { useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  createSupabaseClient,
  formatPrice,
  stripHtml,
  useRecommendations,
  useUser,
  optimizeWithPreset,
} from "@ecommerce/shared";
import type { Product, RecommendationItem } from "@ecommerce/shared";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTrackProductView } from "@/hooks/useMobileTracking";
import { apiGet, apiPost } from "@/server/apiClient";

// ─── Constants ───────────────────────────────────────────────────────────────

const CART_KEY = "violet_cart_id";

const SCREEN_WIDTH = Dimensions.get("window").width;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getSessionToken(): Promise<string | null> {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Fetches full product data from the web backend API.
 *
 * The web backend calls Violet's GET /catalog/offers/{id} server-side
 * and transforms the response to our internal camelCase Product shape.
 */
async function fetchProduct(offerId: string): Promise<Product | null> {
  try {
    const json = await apiGet<{ data?: Product }>(`/api/products/${offerId}`);
    return json.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves a Violet offer ID to its first available SKU ID.
 *
 * Violet's cart API requires a SKU id (the purchasable variant), not an offer id
 * (the product listing). This calls the web backend which resolves the SKU.
 */
async function resolveSkuId(offerId: string): Promise<{ skuId: string; name: string } | null> {
  try {
    const json = await apiGet<{ data?: { skuId: string; name: string } }>(
      `/api/cart/offers/${offerId}`,
    );
    if (!json.data?.skuId) return null;
    return { skuId: json.data.skuId, name: json.data.name };
  } catch {
    return null;
  }
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

type AddState = "idle" | "loading" | "added" | "error";

export default function ProductDetailScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const theme = useTheme();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [addState, setAddState] = useState<AddState>("idle");

  // Track product view on screen focus (Story 6.2)
  const trackProductView = useTrackProductView(productId);
  useFocusEffect(
    useCallback(() => {
      trackProductView();
    }, [trackProductView]),
  );

  // Fetch product on mount
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      const data = await fetchProduct(productId);
      if (!cancelled) {
        setProduct(data);
        setLoadError(data === null);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  /**
   * Add to cart via the web backend API.
   *
   * Flow:
   * 1. Resolve offer ID → first available SKU id
   * 2. Get or create Violet cart
   * 3. POST sku_id to /api/cart/{cartId}/skus
   */
  const handleAddToCart = async () => {
    if (addState !== "idle") return;
    setAddState("loading");

    try {
      const token = await getSessionToken();
      if (!token) {
        Alert.alert("Sign in required", "Please sign in to add items to your bag.");
        setAddState("idle");
        return;
      }

      // Step 1: Resolve offer ID → first available SKU id
      const resolved = await resolveSkuId(productId);
      if (!resolved) {
        Alert.alert("Error", "Could not add this product. It may be unavailable.");
        setAddState("error");
        setTimeout(() => setAddState("idle"), 2000);
        return;
      }

      // Step 2: Get or create cart
      let violetCartId = await SecureStore.getItemAsync(CART_KEY);
      if (!violetCartId) {
        const createJson = await apiPost<{ data?: { violetCartId?: string } }>("/api/cart", {});
        violetCartId = createJson.data?.violetCartId ?? null;
        if (!violetCartId) {
          setAddState("idle");
          return;
        }
        await SecureStore.setItemAsync(CART_KEY, violetCartId);
      }

      // Step 3: Add SKU to cart using the resolved sku_id
      const addJson = await apiPost<{ data?: unknown; error?: unknown }>(
        `/api/cart/${violetCartId}/skus`,
        {
          skuId: Number(resolved.skuId),
          quantity: 1,
        },
      );

      if (!addJson.error) {
        setAddState("added");
        setTimeout(() => setAddState("idle"), 1500);
      } else {
        setAddState("error");
        setTimeout(() => setAddState("idle"), 2000);
      }
    } catch {
      setAddState("idle");
    }
  };

  // ─── Loading state ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Loading…" }} />
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.tint} />
        </ThemedView>
      </>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────
  if (loadError || !product) {
    return (
      <>
        <Stack.Screen options={{ title: "Product Not Found" }} />
        <ThemedView style={styles.loadingContainer}>
          <ThemedText themeColor="textSecondary" style={{ textAlign: "center" }}>
            Product not found. It may have been removed.
          </ThemedText>
        </ThemedView>
      </>
    );
  }

  // ─── Product loaded — render full PDP ───────────────────────────────
  const images = [...product.images].sort((a, b) => a.displayOrder - b.displayOrder);
  const isAvailable = product.available;
  const priceDisplay = formatPrice(product.minPrice, product.currency);
  const plainDescription = stripHtml(product.htmlDescription ?? product.description);

  const addLabel =
    addState === "loading"
      ? "Adding…"
      : addState === "added"
        ? "✓ Added!"
        : addState === "error"
          ? "Failed — retry"
          : "Add to Bag";

  return (
    <>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Image Gallery — horizontal swipe */}
        {images.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.gallery}
            accessibilityLabel={`Product images, ${images.length} total`}
          >
            {images.map((img, i) => (
              <Image
                key={img.id}
                source={{ uri: optimizeWithPreset(img.url, "pdpThumb") ?? undefined }}
                style={styles.heroImage}
                accessibilityLabel={`${product.name} - Image ${i + 1} of ${images.length}`}
              />
            ))}
          </ScrollView>
        ) : (
          <ThemedView type="backgroundElement" style={styles.noImage}>
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

        {/* Add to Bag CTA */}
        <View style={styles.ctaWrap}>
          <TouchableOpacity
            style={[
              styles.cta,
              !isAvailable && styles.ctaDisabled,
              addState === "loading" && styles.ctaLoading,
            ]}
            onPress={handleAddToCart}
            disabled={!isAvailable || addState === "loading"}
            accessibilityLabel={addLabel}
            accessibilityState={{ busy: addState === "loading" }}
          >
            {addState === "loading" ? (
              <ActivityIndicator size="small" color="#fafaf8" />
            ) : (
              <ThemedText style={styles.ctaText}>{isAvailable ? addLabel : "Sold Out"}</ThemedText>
            )}
          </TouchableOpacity>

          {/* Affiliate disclosure */}
          <ThemedText type="small" themeColor="textSecondary" style={styles.disclosure}>
            We may earn a commission from this purchase.
          </ThemedText>
        </View>

        {/* Recommendations */}
        <RecommendationsSection productId={product.id} />
      </ScrollView>
    </>
  );
}

// ─── Recommendations ─────────────────────────────────────────────────────────

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
        <Image
          source={{ uri: optimizeWithPreset(item.thumbnailUrl, "recommendation") ?? undefined }}
          style={styles.recImage}
        />
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.six,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  gallery: {
    height: 400,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    resizeMode: "cover",
  },
  noImage: {
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
    gap: Spacing.two,
  },
  cta: {
    backgroundColor: "#2c2c2c",
    paddingVertical: Spacing.four,
    borderRadius: 4,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaLoading: {
    opacity: 0.7,
  },
  ctaText: {
    color: "#fafaf8",
    fontWeight: "600",
    fontSize: 16,
  },
  disclosure: {
    textAlign: "center",
    fontStyle: "italic",
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
