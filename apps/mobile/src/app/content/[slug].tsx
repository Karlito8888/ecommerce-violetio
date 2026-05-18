// Content detail screen — migrated from Supabase to Convex queries (Phase 6).
//
// Uses Convex useQuery for content page + related content instead of
// createSupabaseClient + getContentPageBySlug/getRelatedContent from @ecommerce/shared.
//
// Convex provides reactivity by default — data stays in sync automatically.

import React from "react";
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
import { useQuery } from "convex/react";
import { api } from "#convex/_generated/api";
import { CONTENT_TYPE_LABELS, stripMarkdownSyntax } from "@ecommerce/shared";

/** Local type matching Convex contentPages schema. */
interface ContentPage {
  _id: string;
  slug: string;
  title: string;
  type: string;
  bodyMarkdown: string;
  author: string;
  publishedAt?: number;
  seoDescription?: string;
  featuredImageUrl?: string;
  relatedSlugs: string[];
}

interface RelatedContentItem {
  _id: string;
  slug: string;
  title: string;
  type: string;
}

/**
 * Mobile content detail screen.
 *
 * Uses Convex queries for data fetching (reactive by default).
 * Markdown rendering uses stripMarkdownSyntax() for clean plain text (MVP).
 */
export default function ContentDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();

  const content = useQuery(api.content.queries.getContentPageBySlug, { slug, now: Date.now() }) as
    | ContentPage
    | null
    | undefined;

  const relatedItems = useQuery(
    api.content.queries.getRelatedContent,
    content?.relatedSlugs?.length ? { slugs: content.relatedSlugs, now: Date.now() } : "skip",
  ) as RelatedContentItem[] | undefined;

  const loading = content === undefined;
  const error = content === null;

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

      {/* Body — stripped markdown for readable plain text (MVP) */}
      <Text style={styles.body}>{stripMarkdownSyntax(content.bodyMarkdown)}</Text>

      {/* Related content */}
      {relatedItems && relatedItems.length > 0 && (
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
