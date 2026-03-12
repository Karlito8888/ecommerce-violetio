import { Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/* ─── Types ──────────────────────────────────── */

/**
 * Filter state for price and availability.
 * Mirrors the web `ActiveFilters` type — prices in integer cents.
 */
interface ActiveFilters {
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
}

/** A predefined filter chip option. */
interface FilterOption {
  id: string;
  label: string;
  filter: Omit<ActiveFilters, "inStock"> | null;
  isAvailability?: boolean;
}

/**
 * Same filter options as web — consistent UX across platforms.
 * Prices in integer cents (Violet API convention).
 */
const FILTER_OPTIONS: FilterOption[] = [
  { id: "all", label: "All", filter: null },
  { id: "under-50", label: "Under $50", filter: { maxPrice: 5000 } },
  { id: "under-100", label: "Under $100", filter: { maxPrice: 10000 } },
  { id: "100-200", label: "$100–$200", filter: { minPrice: 10000, maxPrice: 20000 } },
  { id: "200-plus", label: "$200+", filter: { minPrice: 20000 } },
  { id: "in-stock", label: "In Stock", filter: {}, isAvailability: true },
];

/**
 * Sort options — same values as web SortSelect component.
 *
 * **Note**: Sort state is currently local-only (UI placeholder).
 * It will be connected to the data fetching layer when Edge Function
 * integration is implemented (future story). The sort value should be
 * decoded into `sortBy` + `sortDirection` params matching `ProductQuery`.
 *
 * @see apps/web/src/components/product/SortSelect.tsx — web counterpart
 * @todo Connect sortValue to productsInfiniteQueryOptions when Edge Functions land
 */
const SORT_OPTIONS = [
  { value: "relevance" as const, label: "Relevance" },
  { value: "price-asc" as const, label: "Price: Low → High" },
  { value: "price-desc" as const, label: "Price: High → Low" },
];

/* ─── Component ──────────────────────────────── */

/**
 * Mobile product listing screen with filter chips and sort.
 *
 * ## State management
 *
 * Unlike web (URL search params), mobile manages filter/sort state via `useState`.
 * Expo Router's search param support is limited and doesn't provide the same
 * shareable/bookmarkable UX that TanStack Router offers on web.
 *
 * ## Data fetching (placeholder)
 *
 * Full data fetching pending Edge Function integration (future story).
 * Currently shows the filter/sort UI as a functional placeholder.
 *
 * @see apps/web/src/routes/products/index.tsx — web counterpart with URL state
 */
export default function ProductListingScreen() {
  const theme = useTheme();
  const [filters, setFilters] = useState<ActiveFilters>({});
  const [sortValue, setSortValue] = useState<string>("relevance");

  const hasAnyFilter =
    filters.minPrice !== undefined || filters.maxPrice !== undefined || filters.inStock === true;

  function isFilterActive(option: FilterOption): boolean {
    if (option.id === "all") return !hasAnyFilter;
    if (option.isAvailability) return filters.inStock === true;
    return (
      filters.minPrice === option.filter?.minPrice && filters.maxPrice === option.filter?.maxPrice
    );
  }

  function handleFilterPress(option: FilterOption) {
    if (option.id === "all") {
      setFilters({});
      return;
    }
    if (option.isAvailability) {
      setFilters((prev) => ({
        ...prev,
        inStock: prev.inStock ? undefined : true,
      }));
      return;
    }
    const alreadyActive = isFilterActive(option);
    setFilters((prev) => ({
      minPrice: alreadyActive ? undefined : option.filter?.minPrice,
      maxPrice: alreadyActive ? undefined : option.filter?.maxPrice,
      inStock: prev.inStock,
    }));
  }

  return (
    <>
      <Stack.Screen options={{ title: "Products" }} />
      <ThemedView style={styles.container}>
        {/* Filter chips — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          {FILTER_OPTIONS.map((option) => {
            const active = isFilterActive(option);
            return (
              <Pressable
                key={option.id}
                onPress={() => handleFilterPress(option)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${option.label} filter`}
                style={[
                  styles.chip,
                  active && { backgroundColor: theme.tint, borderColor: theme.tint },
                ]}
              >
                <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Sort pills — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.sortScroll}
        >
          {SORT_OPTIONS.map((option) => {
            const active = sortValue === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setSortValue(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Sort by ${option.label}`}
                style={[
                  styles.chip,
                  active && { backgroundColor: theme.tint, borderColor: theme.tint },
                ]}
              >
                <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>
                  {option.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Placeholder content */}
        <View style={styles.placeholder}>
          <ActivityIndicator size="large" color={theme.tint} />
          <ThemedText themeColor="textSecondary" style={styles.placeholderText}>
            Product listing coming soon — pending Edge Function integration.
          </ThemedText>
        </View>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chipScroll: {
    flexGrow: 0,
    paddingVertical: Spacing.two,
  },
  sortScroll: {
    flexGrow: 0,
    paddingBottom: Spacing.two,
  },
  chipRow: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.textSecondary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "500",
  },
  chipTextActive: {
    color: Colors.light.background,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.three,
    padding: Spacing.four,
  },
  placeholderText: {
    textAlign: "center",
    fontStyle: "italic",
  },
});
