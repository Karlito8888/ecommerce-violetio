import { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMobileTracking } from "@/hooks/useMobileTracking";
import { useAuth } from "@/context/AuthContext";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import ProductList from "@/components/product/ProductList";
import ContentCard from "@/components/ContentCard";
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from "@/constants/theme";
import { useRecentlyViewed, createSupabaseClient, getContentPages } from "@ecommerce/shared";
import type { Product, ContentListItem } from "@ecommerce/shared";

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

        <RecentlyViewedSection />

        <GuidesSection />

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

/**
 * Recently Viewed section for the mobile home screen (Story 6.6).
 *
 * Shows a horizontal FlatList of recently viewed products for authenticated users.
 * Uses user_events table (cross-device) via useRecentlyViewed hook.
 *
 * ### Product enrichment — not yet wired up
 * Fetching full product details from the Violet API requires Edge Function
 * integration (pending Story 3.2-mobile). For now, shows placeholder cards
 * that are tappable and navigate to the product detail screen, which already
 * fetches full data — so this is a functional navigation shortcut even
 * without client-side enrichment.
 *
 * ### [H3 code-review fix] Options-object signature
 * Uses `useRecentlyViewed({ userId })` (options object) instead of the
 * previous positional `useRecentlyViewed(userId)` — matches AC #7 spec.
 *
 * ### [M2 code-review fix] Accessibility labels
 * accessibilityLabel uses a generic "View recently viewed product" instead
 * of exposing raw UUIDs to screen readers. Once product enrichment is wired
 * up, this should be updated to include the product name.
 */
function RecentlyViewedSection() {
  const { user, isAnonymous } = useAuth();
  const userId = user && !isAnonymous ? user.id : undefined;
  const { data: productIds, isLoading } = useRecentlyViewed({ userId });
  const router = useRouter();

  if (isLoading) {
    return (
      <View style={styles.recentSection}>
        <ThemedText type="subtitle" style={styles.recentHeading}>
          Recently Viewed
        </ThemedText>
        <ActivityIndicator size="small" style={styles.recentLoader} />
      </View>
    );
  }

  if (!productIds || productIds.length === 0) return null;

  return (
    <View style={styles.recentSection}>
      <ThemedText type="subtitle" style={styles.recentHeading}>
        Recently Viewed
      </ThemedText>
      <FlatList
        data={productIds}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recentList}
        keyExtractor={(id) => id}
        renderItem={({ item: productId }) => (
          <TouchableOpacity
            style={styles.recentCard}
            onPress={() => router.push(`/products/${productId}` as never)}
            accessibilityRole="button"
            accessibilityLabel="View recently viewed product"
          >
            <View style={styles.recentPlaceholder}>
              <ThemedText type="small" style={styles.recentPlaceholderText}>
                View Product
              </ThemedText>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

/**
 * Guides section for the mobile home screen (Story 7.2).
 *
 * Shows a horizontal FlatList of the 6 most recent published content items.
 * "See All" navigates to the full content listing screen.
 */
function GuidesSection() {
  const [guides, setGuides] = useState<ContentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function fetchGuides() {
      try {
        const client = createSupabaseClient();
        const result = await getContentPages(client, { limit: 6 });
        if (!cancelled) setGuides(result.items);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchGuides();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) return null;
  if (guides.length === 0) return null;

  return (
    <View style={styles.guidesSection}>
      <View style={styles.guidesSectionHeader}>
        <ThemedText type="subtitle" style={styles.guidesHeading}>
          Guides
        </ThemedText>
        <TouchableOpacity
          onPress={() => router.push("/content/" as never)}
          accessibilityRole="link"
          accessibilityLabel="See all guides"
        >
          <ThemedText style={styles.guidesSeeAll}>See All</ThemedText>
        </TouchableOpacity>
      </View>
      <FlatList
        data={guides}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.guidesList}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ContentCard content={item} compact />}
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
  recentSection: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  recentHeading: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  recentLoader: {
    paddingVertical: Spacing.four,
  },
  recentList: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  recentCard: {
    width: 140,
    borderRadius: Spacing.two,
    overflow: "hidden",
    backgroundColor: Colors.light.backgroundElement,
  },
  recentPlaceholder: {
    width: "100%",
    aspectRatio: 3 / 4,
    backgroundColor: Colors.light.backgroundSelected,
    alignItems: "center",
    justifyContent: "center",
  },
  recentPlaceholderText: {
    color: Colors.light.textSecondary,
    fontSize: 12,
  },
  guidesSection: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  guidesSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  guidesHeading: {},
  guidesSeeAll: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.light.tint,
  },
  guidesList: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
});
