import { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import { useMobileTracking } from "@/hooks/useMobileTracking";
import { useAuth } from "@/context/AuthContext";

import { ThemedView } from "@/components/themed-view";
import ProductList from "@/components/product/ProductList";
import { Colors, Fonts, Spacing, MaxContentWidth } from "@/constants/theme";
import { useRecentlyViewed, productsInfiniteQueryOptions } from "@ecommerce/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchProductsMobile } from "@/server/getProducts";

/**
 * Fallback categories matching the web CategoryChips component.
 * Will be replaced by dynamic fetch from Violet API in a future story.
 */
const FALLBACK_CATEGORIES = [
  { slug: "all", label: "All", filter: undefined as string | undefined },
  { slug: "home", label: "Home & Living", filter: "Home" },
  { slug: "fashion", label: "Fashion", filter: "Clothing" },
  { slug: "gifts", label: "Gifts", filter: "Gifts" },
  { slug: "beauty", label: "Beauty", filter: "Beauty" },
  { slug: "accessories", label: "Accessories", filter: "Accessories" },
];

export default function HomeScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === "unspecified" ? "light" : (scheme ?? "light")];
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);

  const { trackEvent } = useMobileTracking();
  const prevCategory = useRef(activeCategory);
  useEffect(() => {
    if (activeCategory && activeCategory !== prevCategory.current) {
      prevCategory.current = activeCategory;
      const cat = FALLBACK_CATEGORIES.find((c) => c.filter === activeCategory);
      trackEvent({
        event_type: "category_view",
        payload: {
          category_id: activeCategory,
          category_name: cat?.label ?? activeCategory,
        },
      });
    }
  }, [activeCategory, trackEvent]);

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery(
    productsInfiniteQueryOptions({ category: activeCategory, pageSize: 12 }, fetchProductsMobile),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products = data?.pages.flatMap((p: any) => p?.data?.data ?? []) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total: number = (data?.pages[0] as any)?.data?.total ?? 0;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safeArea}>
        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={[styles.chipsRow, { borderBottomColor: colors.backgroundElement }]}
        >
          {FALLBACK_CATEGORIES.map(({ slug, label, filter }) => {
            const isActive = activeCategory === filter || (slug === "all" && !activeCategory);
            return (
              <Pressable
                key={slug}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isActive ? colors.tint : "transparent",
                    borderColor: isActive ? colors.tint : colors.backgroundSelected,
                  },
                ]}
                onPress={() => setActiveCategory(filter)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: isActive ? colors.buttonText : colors.text,
                      fontFamily: isActive ? Fonts?.sans : undefined,
                    },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <RecentlyViewedSection />

        <ProductList
          products={products}
          total={total}
          hasNext={!!hasNextPage}
          isLoading={isLoading || isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
      </View>
    </ThemedView>
  );
}

function RecentlyViewedSection() {
  const { user, isAnonymous } = useAuth();
  const scheme = useColorScheme();
  const colors = Colors[scheme === "unspecified" ? "light" : (scheme ?? "light")];
  const userId = user && !isAnonymous ? user.id : undefined;
  const { data: productIds, isLoading } = useRecentlyViewed({ userId });
  const router = useRouter();

  if (isLoading) {
    return (
      <View style={styles.recentSection}>
        <Text style={[styles.recentHeading, { color: colors.text }]}>Recently Viewed</Text>
        <ActivityIndicator size="small" style={styles.recentLoader} color={colors.tint} />
      </View>
    );
  }

  if (!productIds || productIds.length === 0) return null;

  return (
    <View style={styles.recentSection}>
      <Text style={[styles.recentHeading, { color: colors.text }]}>Recently Viewed</Text>
      <FlatList
        data={productIds}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recentList}
        keyExtractor={(id) => id}
        renderItem={({ item: productId }) => (
          <Pressable
            style={[styles.recentCard, { backgroundColor: colors.backgroundElement }]}
            onPress={() => router.push(`/products/${productId}` as never)}
            accessibilityRole="button"
            accessibilityLabel="View recently viewed product"
          >
            <View
              style={[styles.recentPlaceholder, { backgroundColor: colors.backgroundSelected }]}
            >
              <Text style={[styles.recentPlaceholderText, { color: colors.textSecondary }]}>
                View
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    width: "100%",
  },
  chipsRow: {
    borderBottomWidth: 1,
    flexGrow: 0,
    flexShrink: 0,
  },
  chips: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  recentSection: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  recentHeading: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  recentLoader: {
    paddingVertical: Spacing.four,
  },
  recentList: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  recentCard: {
    width: 120,
    borderRadius: Spacing.two,
    overflow: "hidden",
  },
  recentPlaceholder: {
    width: "100%",
    aspectRatio: 3 / 4,
    alignItems: "center",
    justifyContent: "center",
  },
  recentPlaceholderText: {
    fontSize: 11,
  },
});
