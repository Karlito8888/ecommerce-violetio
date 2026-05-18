// Help Center / FAQ screen — migrated from Supabase to Convex queries (Phase 6).
//
// Uses Convex useQuery(api.content.queries.getFaqItems) instead of
// createSupabaseClient + getFaqItems from @ecommerce/shared.
//
// Data shape change: Convex returns { category: string, items: FaqItemDoc[] }
// instead of { name: string, items: FaqItem[] }. Local type adapter used.

import { useState, useMemo, useCallback } from "react";
import {
  SectionList,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "#convex/_generated/api";
import { stripMarkdownSyntax } from "@ecommerce/shared";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors, Spacing, MaxContentWidth } from "@/constants/theme";

/** Local type matching Convex faqItems schema. */
interface FaqItemDoc {
  _id: string;
  category: string;
  question: string;
  answerMarkdown: string;
  sortOrder: number;
  isPublished: boolean;
}

interface FaqCategoryGroup {
  category: string;
  items: FaqItemDoc[];
}

/**
 * Help Center / FAQ screen for mobile.
 *
 * Uses SectionList with categories as section headers.
 * Each FAQ item is expandable (Pressable toggle).
 * Search filters questions and answers client-side.
 */
export default function HelpScreen() {
  const router = useRouter();
  const categories = useQuery(api.content.queries.getFaqItems) as FaqCategoryGroup[] | undefined;
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const loading = categories === undefined;

  const filtered = useMemo(() => {
    if (!categories) return [];
    if (!searchQuery.trim()) return categories;
    const lower = searchQuery.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.question.toLowerCase().includes(lower) ||
            item.answerMarkdown.toLowerCase().includes(lower),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, searchQuery]);

  const sections = useMemo(
    () =>
      filtered.map((cat) => ({
        title: cat.category,
        data: cat.items,
      })),
    [filtered],
  );

  const toggleItem = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search FAQ…"
          placeholderTextColor={Colors.light.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search FAQ"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item._id}
        renderSectionHeader={({ section }) => (
          <ThemedView style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
          </ThemedView>
        )}
        renderItem={({ item }) => (
          <FaqItemRow
            item={item as FaqItemDoc}
            expanded={expandedIds.has((item as FaqItemDoc)._id)}
            onToggle={toggleItem}
          />
        )}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>
              {searchQuery ? `No results for "${searchQuery}"` : "No FAQ items available."}
            </ThemedText>
          </View>
        }
        ListFooterComponent={
          <View style={styles.contactCta}>
            <ThemedText style={styles.contactCtaText}>
              Can&apos;t find what you&apos;re looking for?
            </ThemedText>
            <TouchableOpacity
              style={styles.contactCtaButton}
              onPress={() => router.push("/help/contact" as never)}
              accessibilityRole="button"
              accessibilityLabel="Contact our support team"
            >
              <ThemedText style={styles.contactCtaButtonText}>Contact Us</ThemedText>
            </TouchableOpacity>
          </View>
        }
      />
    </ThemedView>
  );
}

function FaqItemRow({
  item,
  expanded,
  onToggle,
}: {
  item: FaqItemDoc;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.itemContainer}>
      <TouchableOpacity
        style={styles.questionRow}
        onPress={() => onToggle(item._id)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={item.question}
      >
        <ThemedText style={styles.questionText}>{item.question}</ThemedText>
        <ThemedText style={styles.chevron}>{expanded ? "▲" : "▼"}</ThemedText>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.answerContainer}>
          <ThemedText style={styles.answerText}>
            {stripMarkdownSyntax(item.answerMarkdown)}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  searchContainer: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  searchInput: {
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    width: "100%",
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.light.backgroundSelected,
    borderRadius: 8,
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: Colors.light.backgroundElement,
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    width: "100%",
  },
  sectionHeader: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundSelected,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  itemContainer: {
    borderWidth: 1,
    borderColor: Colors.light.backgroundSelected,
    borderRadius: 8,
    marginBottom: Spacing.two,
    overflow: "hidden",
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.three,
  },
  questionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    marginRight: Spacing.two,
  },
  chevron: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  answerContainer: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  answerText: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.light.textSecondary,
  },
  emptyContainer: {
    padding: Spacing.five,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  contactCta: {
    alignItems: "center",
    paddingVertical: Spacing.five,
    marginTop: Spacing.four,
  },
  contactCtaText: {
    fontSize: 16,
    color: Colors.light.textSecondary,
    marginBottom: Spacing.three,
  },
  contactCtaButton: {
    backgroundColor: Colors.light.accent,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  contactCtaButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
});
