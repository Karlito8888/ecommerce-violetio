import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams, Stack, Link } from "expo-router";
import { View, FlatList, ActivityIndicator, Pressable } from "react-native";
import type { MerchantDetail, Product } from "@ecommerce/shared";
import { ThemedText } from "../../components/themed-text";
import ProductCard from "../../components/product/ProductCard";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { fetchMerchantByIdMobile, fetchMerchantProductsMobile } from "@/server/getMerchants";

const PAGE_SIZE = 12;

// ─── Screen ───────────────────────────────────────────────────────────

export default function MerchantScreen() {
  const { merchantId } = useLocalSearchParams<{ merchantId: string }>();
  const theme = useTheme();

  // Fetch merchant metadata
  const { data: merchantResult, isLoading: isLoadingMeta } = useQuery({
    queryKey: ["merchant", merchantId],
    queryFn: () => fetchMerchantByIdMobile(merchantId),
    staleTime: 5 * 60 * 1000,
    enabled: !!merchantId,
  });

  // Fetch products (infinite scroll)
  const {
    data: productsData,
    isLoading: isLoadingProducts,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["merchant-products", merchantId],
    queryFn: ({ pageParam = 1 }) =>
      fetchMerchantProductsMobile(merchantId, pageParam as number, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.data?.hasNext) return undefined;
      return (lastPage.data.page ?? 1) + 1;
    },
    enabled: !!merchantId,
    staleTime: 5 * 60 * 1000,
  });

  const merchant: MerchantDetail | null = merchantResult?.data ?? null;
  const allProducts: Product[] = productsData?.pages.flatMap((p) => p.data?.data ?? []) ?? [];
  const total = productsData?.pages[0]?.data?.total ?? null;
  const isLoading = isLoadingMeta || isLoadingProducts;

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Merchant", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </>
    );
  }

  if (!merchant) {
    return (
      <>
        <Stack.Screen options={{ title: "Merchant", headerBackTitle: "Back" }} />
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing.four }}
        >
          <ThemedText style={{ textAlign: "center", color: theme.textSecondary }}>
            Merchant not found.
          </ThemedText>
          <Pressable onPress={() => {}} style={{ marginTop: Spacing.three }}>
            <Link href="/" asChild>
              <Pressable>
                <ThemedText style={{ color: theme.accent }}>← Back to home</ThemedText>
              </Pressable>
            </Link>
          </Pressable>
        </View>
      </>
    );
  }

  const platformLabel = merchant.platform
    ? merchant.platform.charAt(0) + merchant.platform.slice(1).toLowerCase()
    : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: merchant.name,
          headerBackTitle: "Back",
        }}
      />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
        {/* Merchant header */}
        <View
          style={{
            marginBottom: 16,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#e5e7eb",
          }}
        >
          <ThemedText type="title">{merchant.name}</ThemedText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {platformLabel && (
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: "#f3f4f6",
                }}
              >
                <ThemedText type="small">{platformLabel} merchant</ThemedText>
              </View>
            )}
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: "#ecfdf5",
              }}
            >
              <ThemedText type="small" style={{ color: "#059669" }}>
                ✓ Verified
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Products */}
        {allProducts.length === 0 ? (
          <ThemedText style={{ textAlign: "center", marginTop: 40, color: "#9ca3af" }}>
            No products available from this merchant yet.
          </ThemedText>
        ) : (
          <FlatList
            data={allProducts}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
            renderItem={({ item }) => (
              <Link href={`/products/${item.id}`} asChild>
                <Pressable style={{ flex: 1 }}>
                  <ProductCard product={item} />
                </Pressable>
              </Link>
            )}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            ListHeaderComponent={
              <View
                style={{ marginBottom: 12, flexDirection: "row", alignItems: "baseline", gap: 8 }}
              >
                <ThemedText style={{ fontSize: 16, fontWeight: "600" }}>Products</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Showing {allProducts.length}
                  {total != null ? ` of ${total}` : ""} products
                </ThemedText>
              </View>
            }
            ListFooterComponent={
              isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null
            }
          />
        )}
      </View>
    </>
  );
}
