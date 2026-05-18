// Content listing screen — migrated from Supabase to Convex queries (Phase 6).
//
// Uses Convex useQuery with paginated query instead of
// createSupabaseClient + getContentPages from @ecommerce/shared.
//
// Convex provides reactivity by default — no manual cache invalidation needed.

import { useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePaginatedQuery } from "convex/react";
import { api } from "#convex/_generated/api";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import ContentCard from "@/components/ContentCard";
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from "@/constants/theme";

/** Content type filter options. */
const TYPE_OPTIONS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "guide", label: "Guides" },
  { value: "comparison", label: "Comparisons" },
  { value: "review", label: "Reviews" },
];

/** Local type matching Convex contentPages schema. */
interface ContentListItem {
  _id: string;
  slug: string;
  title: string;
  type: string;
  author: string;
  publishedAt?: number;
  featuredImageUrl?: string;
  seoDescription?: string;
}

/**
 * Content listing screen — full list of editorial content with type filtering.
 *
 * Uses Convex paginated query. Convex provides reactivity by default.
 */
export default function ContentListScreen() {
  const [activeType, setActiveType] = useState<string | undefined>(undefined);

  // Stable timestamp — memoized to avoid resetting pagination on re-render.
  // Content filtering uses this to exclude future-dated articles.
  const now = useMemo(() => Date.now(), []);

  const {
    results: rawItems,
    loadMore,
    status,
  } = usePaginatedQuery(
    api.content.queries.getContentPages,
    { type: activeType, now },
    { initialNumItems: 12 },
  );

  const items: ContentListItem[] = rawItems as ContentListItem[];
  const isLoading = status === "LoadingMore" && items.length === 0;
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMore = status === "LoadingMore" && items.length > 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
        <ThemedText type="title" style={styles.title}>
          Guides & Reviews
        </ThemedText>

        {/* Type filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {TYPE_OPTIONS.map(({ value, label }) => {
            const isActive = activeType === value;
            return (
              <TouchableOpacity
                key={label}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setActiveType(value)}
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

        <FlatList
          data={items}
          renderItem={({ item }) => <ContentCard content={item as never} />}
          keyExtractor={(item) => (item as ContentListItem)._id}
          contentContainerStyle={styles.list}
          onEndReached={() => canLoadMore && loadMore(12)}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <ThemedText style={styles.emptyText}>
                  {activeType
                    ? `No ${activeType === "guide" ? "guides" : activeType === "comparison" ? "comparisons" : "reviews"} available yet.`
                    : "No content available yet."}
                </ThemedText>
              </View>
            ) : null
          }
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footer}>
                <ThemedText type="small">Loading more…</ThemedText>
              </View>
            ) : null
          }
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
  list: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  empty: {
    padding: Spacing.six,
    alignItems: "center",
  },
  emptyText: {
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  footer: {
    padding: Spacing.four,
    alignItems: "center",
  },
});
