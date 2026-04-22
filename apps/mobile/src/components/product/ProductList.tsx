import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import type { Product } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import ProductCard from "./ProductCard";

/**
 * Mobile product list using FlatList with 2 columns.
 *
 * Key design decisions:
 * - `numColumns={2}` for a 2-column grid (matches mobile web breakpoint)
 * - `onEndReached` is NOT used — "Load more" button instead (no infinite scroll per UX spec)
 * - Skeleton loading uses ActivityIndicator (simpler than custom skeleton for MVP)
 * - Category chips rendered as horizontal ScrollView in ListHeaderComponent
 */

interface ProductListProps {
  products: Product[];
  total: number;
  hasNext: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}

export default function ProductList({
  products,
  total,
  hasNext,
  isLoading,
  onLoadMore,
}: ProductListProps) {
  if (isLoading && products.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={products}
      renderItem={({ item }) => (
        <View style={styles.cardWrapper}>
          <ProductCard product={item} />
        </View>
      )}
      keyExtractor={(item) => item.id}
      numColumns={2}
      contentContainerStyle={styles.list}
      style={styles.flatList}
      ListHeaderComponent={
        <ThemedText type="small" style={styles.count}>
          Showing {products.length} of {total} products
        </ThemedText>
      }
      ListFooterComponent={
        hasNext ? (
          <View style={styles.footer}>
            <ThemedText type="small" style={styles.loadMore} onPress={onLoadMore}>
              Load more
            </ThemedText>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.six,
  },
  list: {
    padding: Spacing.two,
  },
  flatList: {
    flex: 1,
  },
  cardWrapper: {
    flex: 1,
    maxWidth: "50%",
  },
  count: {
    textAlign: "center",
    padding: Spacing.two,
  },
  footer: {
    padding: Spacing.four,
    alignItems: "center",
  },
  loadMore: {
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
