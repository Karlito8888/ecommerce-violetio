import { useState, useEffect, useRef } from "react";
import { ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMobileTracking } from "@/hooks/useMobileTracking";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import ProductList from "@/components/product/ProductList";
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from "@/constants/theme";
import type { Product } from "@ecommerce/shared";

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

/**
 * Home screen — product listing with category browsing.
 *
 * Note: Data fetching is placeholder for now. Mobile will use Supabase
 * Edge Functions to proxy Violet API calls (future story). The UI structure
 * is ready for integration with TanStack Query + edge function fetch.
 */
export default function HomeScreen() {
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);

  // Track category browsing (Story 6.2)
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

  // TODO(Story 3.2-mobile): Wire up actual data fetching via Edge Function
  const products: Product[] = [];
  const isLoading = false;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Products
        </ThemedText>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {FALLBACK_CATEGORIES.map(({ slug, label, filter }) => {
            const isActive = activeCategory === filter || (slug === "all" && !activeCategory);
            return (
              <TouchableOpacity
                key={slug}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setActiveCategory(filter)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <ThemedText style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {label}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ProductList
          products={products}
          total={0}
          hasNext={false}
          isLoading={isLoading}
          onLoadMore={() => {}}
        />
      </SafeAreaView>
    </ThemedView>
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
    paddingBottom: BottomTabInset,
  },
  title: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  chips: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.backgroundSelected,
  },
  chipActive: {
    backgroundColor: Colors.light.text,
    borderColor: Colors.light.text,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "500",
  },
  chipTextActive: {
    color: Colors.light.background,
  },
});
