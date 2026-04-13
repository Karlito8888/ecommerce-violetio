import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import type { Product } from "@ecommerce/shared";
import { formatPrice, optimizeWithPreset } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { fetchCollectionByIdMobile, fetchCollectionProductsMobile } from "@/server/getCollections";

const PAGE_SIZE = 12;

// ─── Screen ───────────────────────────────────────────────────────────

export default function CollectionDetailScreen() {
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  const theme = useTheme();
  const router = useRouter();

  // Fetch collection metadata
  const { data: collectionResult, isLoading: isLoadingMeta } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: () => fetchCollectionByIdMobile(collectionId),
    staleTime: 5 * 60 * 1000,
    enabled: !!collectionId,
  });

  // Fetch products (infinite)
  const {
    data: productsData,
    isLoading: isLoadingProducts,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["collection-products", collectionId],
    queryFn: ({ pageParam = 1 }) =>
      fetchCollectionProductsMobile(collectionId, pageParam as number, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.data?.hasNext) return undefined;
      return (lastPage.data.page ?? 1) + 1;
    },
    enabled: !!collectionId,
    staleTime: 5 * 60 * 1000,
  });

  const collection = collectionResult?.data;
  const allProducts: Product[] = productsData?.pages.flatMap((p) => p.data?.data ?? []) ?? [];
  const total = productsData?.pages[0]?.data?.total ?? 0;

  const isLoading = isLoadingMeta || isLoadingProducts;

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: "" }} />
        <ActivityIndicator size="large" color={theme.tint} />
      </ThemedView>
    );
  }

  if (!collection) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: "Collection" }} />
        <ThemedText themeColor="textSecondary" style={styles.emptyText}>
          Collection not found.
        </ThemedText>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { borderColor: theme.tint }]}
        >
          <ThemedText style={[styles.backBtnText, { color: theme.tint }]}>← Go back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: collection.name }} />
      <FlatList
        data={allProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View>
            {/* Hero image */}
            {collection.imageUrl ? (
              <Image
                source={{
                  uri: optimizeWithPreset(collection.imageUrl, "collectionHero") ?? undefined,
                }}
                style={styles.heroImage}
                resizeMode="cover"
                accessibilityLabel={collection.name}
              />
            ) : (
              <View style={[styles.heroPlaceholder, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={styles.heroPlaceholderIcon}>✦</ThemedText>
              </View>
            )}

            {/* Meta */}
            <View style={styles.header}>
              <ThemedText style={[styles.typeBadge, { color: theme.tint }]}>
                {collection.type === "AUTOMATED" ? "Automated" : "Curated"} Collection
              </ThemedText>
              {collection.description ? (
                <ThemedText themeColor="textSecondary" style={styles.description}>
                  {collection.description}
                </ThemedText>
              ) : null}
              <ThemedText themeColor="textSecondary" style={styles.count}>
                {total} product{total !== 1 ? "s" : ""}
              </ThemedText>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              No products in this collection yet.
            </ThemedText>
          </View>
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator
              size="small"
              color={theme.tint}
              style={{ marginVertical: Spacing.four }}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onPress={() => router.push(`/products/${item.id}` as never)}
            theme={theme}
          />
        )}
      />
    </ThemedView>
  );
}

// ─── Product Card (inline, mirrors ProductCard component) ─────────────

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}

function ProductCard({ product, onPress, theme }: ProductCardProps) {
  const price = formatPrice(product.minPrice, product.currency);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${price}`}
    >
      <View style={styles.imageWrap}>
        {product.thumbnailUrl ? (
          <Image
            source={{ uri: optimizeWithPreset(product.thumbnailUrl, "productCard") ?? undefined }}
            style={styles.productImage}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[styles.productImagePlaceholder, { backgroundColor: theme.backgroundElement }]}
          >
            <ThemedText themeColor="textSecondary" style={{ fontSize: 12 }}>
              No image
            </ThemedText>
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <ThemedText style={styles.productName} numberOfLines={2}>
          {product.name}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.merchant} numberOfLines={1}>
          {product.seller}
        </ThemedText>
        <ThemedText style={[styles.price, { color: theme.tint }]}>{price}</ThemedText>
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.four },
  list: { padding: Spacing.three, paddingTop: 0 },
  row: { gap: Spacing.three, marginBottom: Spacing.three },
  emptyText: { fontSize: 15, fontStyle: "italic", textAlign: "center" },

  heroImage: { width: "100%", height: 180 },
  heroPlaceholder: {
    width: "100%",
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPlaceholderIcon: { fontSize: 40, opacity: 0.2 },

  header: {
    padding: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.one,
  },
  typeBadge: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  description: { fontSize: 14, lineHeight: 20 },
  count: { fontSize: 13 },

  backBtn: {
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 99,
    borderWidth: 1,
  },
  backBtnText: { fontSize: 14, fontWeight: "500" },

  // Product card
  card: { flex: 1, borderRadius: 10, overflow: "hidden" },
  imageWrap: { width: "100%", aspectRatio: 3 / 4 },
  productImage: { width: "100%", height: "100%" },
  productImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { padding: Spacing.two, gap: 2 },
  productName: { fontSize: 13, fontWeight: "600", lineHeight: 17 },
  merchant: { fontSize: 11 },
  price: { fontSize: 13, fontWeight: "600" },
});
