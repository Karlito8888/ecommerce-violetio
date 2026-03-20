import React, { useEffect, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Share,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  createSupabaseClient,
  getContentPageBySlug,
  getRelatedContent,
  CONTENT_TYPE_LABELS,
  stripMarkdownSyntax,
} from "@ecommerce/shared";
import type { ContentPage, RelatedContentItem } from "@ecommerce/shared";

/**
 * Mobile content detail screen.
 *
 * **Data fetching (M3 — documented decision):**
 * Uses manual `useEffect`/`useState` instead of TanStack Query because
 * `@tanstack/react-query` is not installed in the mobile app (it's only a
 * peerDependency of `@ecommerce/shared`, consumed by the web app).
 * Tradeoffs vs the web approach:
 * - No caching — re-fetches on every mount
 * - No deduplication — concurrent navigations can cause redundant fetches
 * - No automatic error retry or refetch-on-focus
 * Migration plan: install `@tanstack/react-query` + `QueryClientProvider` in
 * the mobile `_layout.tsx`, then reuse `contentDetailQueryOptions` from shared.
 *
 * **Markdown rendering (M4 — documented decision):**
 * Uses `stripMarkdownSyntax()` to show clean plain text instead of raw markdown.
 * This is an MVP approach — a proper React Native markdown renderer (e.g.
 * `react-native-markdown-display`) should replace this in a future iteration
 * for formatted headings, lists, links, and interactive product embeds.
 *
 * **Shared functions (M2/M3 from Story 7.6 review):**
 * Uses `getContentPageBySlug` and `getRelatedContent` from `@ecommerce/shared`
 * instead of inline Supabase queries. This eliminates code duplication and
 * ensures consistent column selection, mapping, and filtering across platforms.
 */
export default function ContentDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [content, setContent] = useState<ContentPage | null>(null);
  const [relatedItems, setRelatedItems] = useState<RelatedContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchContent() {
      const client = createSupabaseClient();
      const page = await getContentPageBySlug(client, slug);

      if (cancelled) return;

      if (!page) {
        setError(true);
        setLoading(false);
        return;
      }

      setContent(page);

      // Fetch related content if slugs are present
      if (page.relatedSlugs.length > 0) {
        const related = await getRelatedContent(client, page.relatedSlugs);
        if (!cancelled) {
          setRelatedItems(related);
        }
      }

      setLoading(false);
    }

    fetchContent();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Loading..." }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !content) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Not Found" }} />
        <Text style={styles.errorText}>Content not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Stack.Screen options={{ title: content.title }} />

      {/* Type badge */}
      <View style={styles.badgeContainer}>
        <Text style={styles.badge}>{CONTENT_TYPE_LABELS[content.type] || content.type}</Text>
      </View>

      {/* Title */}
      <Text style={styles.title}>{content.title}</Text>

      {/* Meta + Share */}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          {content.author}
          {content.publishedAt && ` · ${new Date(content.publishedAt).toLocaleDateString()}`}
        </Text>
        <Pressable
          style={styles.shareBtn}
          onPress={async () => {
            try {
              await Share.share({
                title: content.title,
                message: `${content.seoDescription ?? content.title}\nhttps://www.maisonemile.com/content/${content.slug}`,
                url: `https://www.maisonemile.com/content/${content.slug}`,
              });
            } catch {
              // User cancelled or share failed — no action needed
            }
          }}
          accessibilityLabel={`Share "${content.title}"`}
          accessibilityRole="button"
        >
          <Text style={styles.shareBtnText}>↗</Text>
        </Pressable>
      </View>

      {/* Affiliate disclosure */}
      <View style={styles.disclosure}>
        <Text style={styles.disclosureText}>
          This page contains affiliate links. We may earn a commission on purchases made through
          these links at no extra cost to you.
        </Text>
      </View>

      {/* Body — stripped markdown for readable plain text (MVP, see JSDoc above) */}
      <Text style={styles.body}>{stripMarkdownSyntax(content.bodyMarkdown)}</Text>

      {/* Related content */}
      {relatedItems.length > 0 && (
        <View style={styles.relatedSection}>
          <Text style={styles.relatedTitle}>Related Articles</Text>
          {relatedItems.map((item) => (
            <Pressable
              key={item.slug}
              style={styles.relatedItem}
              onPress={() => router.push(`/content/${item.slug}` as never)}
            >
              <Text style={styles.relatedItemTitle}>{item.title}</Text>
              <Text style={styles.relatedItemType}>
                {CONTENT_TYPE_LABELS[item.type] || item.type}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafaf8" },
  contentContainer: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fafaf8" },
  badgeContainer: { flexDirection: "row", marginBottom: 12 },
  badge: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#a68b4b",
    backgroundColor: "rgba(201, 169, 110, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  title: { fontSize: 28, fontWeight: "500", color: "#1a1a1a", lineHeight: 34, marginBottom: 8 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  meta: { fontSize: 14, color: "#5a5a5a" },
  shareBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtnText: { fontSize: 16, color: "#5a5a5a" },
  disclosure: { backgroundColor: "#f0eeeb", borderRadius: 4, padding: 12, marginBottom: 24 },
  disclosureText: { fontSize: 12, fontStyle: "italic", color: "#5a5a5a", lineHeight: 18 },
  body: { fontSize: 16, lineHeight: 26, color: "#3d3d3d" },
  errorText: { fontSize: 16, color: "#5a5a5a", marginBottom: 12 },
  backLink: { fontSize: 16, color: "#a68b4b", textDecorationLine: "underline" },
  relatedSection: { marginTop: 32, paddingTop: 24, borderTopWidth: 1, borderTopColor: "#e8e5e0" },
  relatedTitle: { fontSize: 18, fontWeight: "500", color: "#1a1a1a", marginBottom: 12 },
  relatedItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e8e5e0",
  },
  relatedItemTitle: { fontSize: 15, fontWeight: "500", color: "#1a1a1a", marginBottom: 4 },
  relatedItemType: {
    fontSize: 12,
    color: "#a68b4b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
