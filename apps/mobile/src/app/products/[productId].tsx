import { Stack, useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  PixelRatio,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as SecureStore from "expo-secure-store";
import {
  createSupabaseClient,
  formatPrice,
  optimizeImageUrl,
  stripHtml,
  useRecommendations,
  useUser,
  useProductVariants,
  getDefaultSelectedValues,
} from "@ecommerce/shared";
import type { Product, RecommendationItem } from "@ecommerce/shared";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import VariantSelector from "@/components/product/VariantSelector";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTrackProductView } from "@/hooks/useMobileTracking";
import { apiGet, apiPost } from "@/server/apiClient";

// ─── Constants ───────────────────────────────────────────────────────────────

const CART_KEY = "violet_cart_id";
const SCREEN_WIDTH = Dimensions.get("window").width;
const HERO_PX = Math.min(Math.round(SCREEN_WIDTH * PixelRatio.get()), 2160);
const REC_PX = Math.min(Math.round(180 * PixelRatio.get()), 800);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getSessionToken(): Promise<string | null> {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function fetchProduct(offerId: string): Promise<Product | null> {
  try {
    const json = await apiGet<{ data?: Product }>(`/api/products/${offerId}`);
    return json.data ?? null;
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
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  // Track product view on screen focus
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
        // Pre-select first available variant options once product loads
        if (data && !initialized) {
          setSelectedValues(getDefaultSelectedValues(data));
          setInitialized(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // ─── Shared variant logic (DRY — from @ecommerce/shared) ───────────
  const variants = useProductVariants(product ?? emptyProduct, selectedValues);
  const { showVariants, selectedSku, isAvailable, hasDiscount, showPriceRange, galleryImages } =
    variants;

  const handleVariantSelect = useCallback((variantName: string, value: string) => {
    setSelectedValues((prev) => ({ ...prev, [variantName]: value }));
  }, []);

  /** Dynamic price formatting (platform-specific: uses formatPrice). */
  const priceDisplay = useMemo(() => {
    if (!product) return "";
    if (selectedSku) return formatPrice(selectedSku.salePrice, product.currency);
    if (showPriceRange && product.minPrice !== product.maxPrice) {
      return `${formatPrice(product.minPrice, product.currency)} – ${formatPrice(product.maxPrice, product.currency)}`;
    }
    if (showPriceRange) return `From ${formatPrice(product.minPrice, product.currency)}`;
    return formatPrice(product.minPrice, product.currency);
  }, [selectedSku, product, showPriceRange]);

  // ─── Cart logic ─────────────────────────────────────────────────────

  const handleAddToCart = async () => {
    if (addState !== "idle" || !product) return;
    if (!selectedSku) {
      Alert.alert("Select options", "Please select all product options before adding to bag.");
      return;
    }
    setAddState("loading");
    try {
      const token = await getSessionToken();
      if (!token) {
        Alert.alert("Sign in required", "Please sign in to add items to your bag.");
        setAddState("idle");
        return;
      }
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
      const addJson = await apiPost<{ data?: unknown; error?: unknown }>(
        `/api/cart/${violetCartId}/skus`,
        { skuId: Number(selectedSku.id), quantity: 1 },
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
          <ActivityIndicator size="large" color={theme.accent} />
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

  // ─── Product loaded ────────────────────────────────────────────────
  const plainDescription = stripHtml(product.htmlDescription ?? product.description);
  const addLabel =
    addState === "loading"
      ? "Adding…"
      : addState === "added"
        ? "✓ Added!"
        : addState === "error"
          ? "Failed — retry"
          : showVariants && !selectedSku
            ? "Select options"
            : isAvailable
              ? "Add to Bag"
              : "Sold Out";

  return (
    <>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Image Gallery — dynamic per selected variant */}
        {galleryImages.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.gallery}
            accessibilityLabel={`Product images, ${galleryImages.length} total`}
          >
            {galleryImages.map((img, i) => (
              <Image
                key={img.id}
                source={{
                  uri: optimizeImageUrl(img.url, { width: HERO_PX, height: HERO_PX }) ?? img.url,
                }}
                contentFit="cover"
                transition={200}
                style={styles.heroImage}
                accessibilityLabel={`${product.name} - Image ${i + 1} of ${galleryImages.length}`}
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
            <View style={styles.priceContent}>
              {hasDiscount && selectedSku ? (
                <View style={styles.priceDiscountRow}>
                  <ThemedText type="small" style={styles.priceOriginal}>
                    {formatPrice(selectedSku.retailPrice, product.currency)}
                  </ThemedText>
                  <ThemedText type="smallBold" style={styles.priceSale}>
                    {formatPrice(selectedSku.salePrice, product.currency)}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText type="smallBold" style={styles.price}>
                  {priceDisplay}
                </ThemedText>
              )}
            </View>
            <Pressable
              style={styles.shareBtn}
              onPress={async () => {
                try {
                  await Share.share({
                    title: product.name,
                    message: `${product.name} — ${formatPrice(selectedSku?.salePrice ?? product.minPrice, product.currency)}\nhttps://www.maisonemile.com/products/${product.id}`,
                    url: `https://www.maisonemile.com/products/${product.id}`,
                  });
                } catch {
                  // User cancelled or share failed
                }
              }}
              accessibilityLabel={`Share ${product.name}`}
              accessibilityRole="button"
            >
              <ThemedText style={styles.shareBtnText}>↗</ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Variant Selector */}
        {showVariants && (
          <View style={styles.variantSection}>
            <VariantSelector
              variants={product.variants}
              skus={product.skus}
              selectedValues={selectedValues}
              onSelect={handleVariantSelect}
            />
          </View>
        )}

        {/* Description */}
        <View style={styles.description}>
          <ThemedText>{plainDescription}</ThemedText>
        </View>

        {/* CTA */}
        <View style={styles.ctaWrap}>
          <TouchableOpacity
            style={[
              styles.cta,
              { backgroundColor: theme.accent },
              (!isAvailable || addState === "loading") && styles.ctaDisabled,
              addState === "loading" && styles.ctaLoading,
            ]}
            onPress={handleAddToCart}
            disabled={!isAvailable || addState === "loading"}
            accessibilityLabel={addLabel}
            accessibilityState={{ busy: addState === "loading" }}
          >
            {addState === "loading" ? (
              <ActivityIndicator size="small" color={theme.btnText} />
            ) : (
              <Text style={[styles.ctaText, { color: theme.btnText }]}>{addLabel}</Text>
            )}
          </TouchableOpacity>
          <ThemedText type="small" themeColor="textSecondary" style={styles.disclosure}>
            We may earn a commission from this purchase.
          </ThemedText>
        </View>

        <RecommendationsSection productId={product.id} />
      </ScrollView>
    </>
  );
}

// ─── Empty product fallback for hook before product loads ─────────────────────

const emptyProduct: Product = {
  id: "",
  name: "",
  description: "",
  htmlDescription: null,
  minPrice: 0,
  maxPrice: 0,
  currency: "USD",
  available: false,
  visible: false,
  status: "UNAVAILABLE",
  publishingStatus: "NOT_PUBLISHED",
  source: "",
  seller: "",
  vendor: "",
  type: "PHYSICAL",
  externalUrl: "",
  merchantId: "",
  productId: "",
  commissionRate: 0,
  tags: [],
  dateCreated: "",
  dateLastModified: "",
  variants: [],
  skus: [],
  albums: [],
  images: [],
  thumbnailUrl: null,
  shippingInfo: null,
  collectionIds: [],
};

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
          source={{
            uri:
              optimizeImageUrl(item.thumbnailUrl, {
                width: REC_PX,
                height: Math.round(REC_PX * 1.33),
              }) ?? item.thumbnailUrl,
          }}
          contentFit="cover"
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
  container: { flex: 1 },
  content: { paddingBottom: Spacing.six },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  gallery: { height: 400 },
  heroImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
  noImage: { height: 300, alignItems: "center", justifyContent: "center" },
  info: { padding: Spacing.four, gap: Spacing.one },
  name: { fontFamily: "serif" },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.one,
  },
  priceContent: { flex: 1 },
  priceDiscountRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  priceOriginal: { textDecorationLine: "line-through", opacity: 0.5 },
  priceSale: { color: "#B54A4A" },
  price: {},
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtnText: { fontSize: 18, lineHeight: 22 },
  variantSection: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  description: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  ctaWrap: { padding: Spacing.four, paddingTop: Spacing.five, gap: Spacing.two },
  cta: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaLoading: { opacity: 0.7 },
  ctaText: { fontWeight: "600", fontSize: 16, letterSpacing: 0.02 },
  disclosure: { textAlign: "center", fontStyle: "italic" },
  recSection: {
    paddingTop: Spacing.five,
    borderTopWidth: 1,
    borderTopColor: "#e8e4df",
    marginTop: Spacing.four,
    marginHorizontal: Spacing.four,
  },
  recHeading: { fontFamily: "serif", marginBottom: Spacing.three },
  recLoader: { paddingVertical: Spacing.six },
  recList: { gap: Spacing.three },
  recCard: { width: CARD_WIDTH, gap: Spacing.one },
  recImage: { width: CARD_WIDTH, height: CARD_WIDTH * 1.33, borderRadius: 8 },
  recImagePlaceholder: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.33,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  recName: { fontSize: 13, marginTop: Spacing.one },
});
