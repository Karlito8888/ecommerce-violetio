import { useState, useEffect, useCallback } from "react";
import { FlatList, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createSupabaseClient, getContentPages } from "@ecommerce/shared";
import type { ContentType, ContentPage } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import ContentCard from "@/components/ContentCard";
import { Colors, Spacing, BottomTabInset, MaxContentWidth } from "@/constants/theme";

/** Content type filter options. */
const TYPE_OPTIONS: Array<{ value: ContentType | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "guide", label: "Guides" },
  { value: "comparison", label: "Comparisons" },
  { value: "review", label: "Reviews" },
];

/**
 * Content listing screen — full list of editorial content with type filtering.
 *
 * Uses Supabase client directly (no Server Functions on mobile).
 * Implements infinite scroll via FlatList's `onEndReached`.
 */
export default function ContentListScreen() {
  const [activeType, setActiveType] = useState<ContentType | undefined>(undefined);
  const [items, setItems] = useState<ContentPage[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(
    async (pageNum: number, reset = false) => {
      if (reset) setIsLoading(true);
      else setIsLoadingMore(true);

      try {
        setError(null);
        const client = createSupabaseClient();
        const result = await getContentPages(client, {
          type: activeType,
          page: pageNum,
          limit: 12,
        });
        if (reset) {
          setItems(result.items);
        } else {
          setItems((prev) => [...prev, ...result.items]);
        }
        setPage(result.page);
        setHasNext(result.hasNext);
      } catch {
        setError("Failed to load content. Please try again.");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [activeType],
  );

  useEffect(() => {
    fetchContent(1, true);
  }, [fetchContent]);

  const handleLoadMore = () => {
    if (hasNext && !isLoadingMore) {
      fetchContent(page + 1);
    }
  };

  const handleTypeChange = (type: ContentType | undefined) => {
    setActiveType(type);
    setPage(1);
  };

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
                onPress={() => handleTypeChange(value)}
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

        {error && (
          <View style={styles.errorBanner}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity onPress={() => fetchContent(1, true)} style={styles.retryButton}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={items}
          renderItem={({ item }) => <ContentCard content={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onEndReached={handleLoadMore}
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
  errorBanner: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.three,
    backgroundColor: "#fef2f2",
    borderRadius: Spacing.two,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: {
    color: "#991b1b",
    fontSize: 14,
    flex: 1,
  },
  retryButton: {
    marginLeft: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    backgroundColor: "#991b1b",
  },
  retryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
});
