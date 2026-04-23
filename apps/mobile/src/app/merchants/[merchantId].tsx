import { useLocalSearchParams, Stack, Link } from "expo-router";
import { View, FlatList, ActivityIndicator, Pressable } from "react-native";
import { ThemedText } from "../../components/themed-text";
import ProductCard from "../../components/product/ProductCard";
import type { Product } from "@ecommerce/shared";
import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/server/apiClient";

interface MerchantDetail {
  id: string;
  name: string;
  platform: string | null;
  status: string;
  currency: string | null;
  storeUrl: string | null;
  connectedAt: string | null;
}

export default function MerchantScreen() {
  const { merchantId } = useLocalSearchParams<{ merchantId: string }>();
  const [merchant, setMerchant] = useState<MerchantDetail | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(true);

  // Fetch merchant details
  useEffect(() => {
    if (!merchantId) return;

    (async () => {
      try {
        const json = await apiGet<{ data?: MerchantDetail }>(`/api/merchants/${merchantId}`);
        if (json.data) setMerchant(json.data);
      } catch {
        // Merchant details are non-blocking
      }
    })();
  }, [merchantId]);

  // Fetch products
  const fetchProducts = useCallback(
    async (pageNum: number) => {
      try {
        const json = await apiGet<{
          data?: { data?: Product[]; hasNext?: boolean };
        }>(`/api/merchants/${merchantId}/products?page=${pageNum}&pageSize=12`);
        const newProducts = (json.data?.data ?? []) as Product[];
        setHasNext(json.data?.hasNext ?? false);
        return newProducts;
      } catch {
        return [];
      }
    },
    [merchantId],
  );

  // Initial load
  useEffect(() => {
    if (!merchantId) return;
    setLoading(true);
    fetchProducts(1).then((data) => {
      setProducts(data);
      setLoading(false);
    });
  }, [merchantId, fetchProducts]);

  // Load more
  const handleLoadMore = async () => {
    if (loadingMore || !hasNext) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const newProducts = await fetchProducts(nextPage);
    setProducts((prev) => [...prev, ...newProducts]);
    setPage(nextPage);
    setLoadingMore(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: merchant?.name ?? "Merchant",
          headerBackTitle: "Back",
        }}
      />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
        {/* Merchant header */}
        {merchant && (
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
              {merchant.platform && (
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: "#f3f4f6",
                  }}
                >
                  <ThemedText type="small">
                    {merchant.platform.charAt(0) + merchant.platform.slice(1).toLowerCase()}
                  </ThemedText>
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
        )}

        {/* Products */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" />
        ) : products.length === 0 ? (
          <ThemedText style={{ textAlign: "center", marginTop: 40, color: "#9ca3af" }}>
            No products available from this merchant yet.
          </ThemedText>
        ) : (
          <FlatList
            data={products}
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
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null
            }
          />
        )}
      </View>
    </>
  );
}
