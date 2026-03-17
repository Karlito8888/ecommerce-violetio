import React, { useEffect, useState } from "react";
import { ScrollView, Text, View, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { createSupabaseClient } from "@ecommerce/shared";
import type { ContentPage } from "@ecommerce/shared";

/**
 * Mobile content detail screen.
 * Fetches content from Supabase and renders a simple text-based layout.
 *
 * Markdown rendering is kept simple (no external library) for MVP —
 * basic formatting via text styling. A full markdown renderer can be
 * added in a future iteration if content complexity requires it.
 */
export default function ContentDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [content, setContent] = useState<ContentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchContent() {
      const client = createSupabaseClient();
      const { data, error: err } = await client
        .from("content_pages")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .single();

      if (cancelled) return;

      if (err || !data) {
        setError(true);
        setLoading(false);
        return;
      }

      // Map snake_case to camelCase
      setContent({
        id: data.id,
        slug: data.slug,
        title: data.title,
        type: data.type,
        bodyMarkdown: data.body_markdown,
        author: data.author,
        publishedAt: data.published_at,
        seoTitle: data.seo_title,
        seoDescription: data.seo_description,
        featuredImageUrl: data.featured_image_url,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
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

  const typeLabel =
    content.type === "guide" ? "Guide" : content.type === "comparison" ? "Comparison" : "Review";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Stack.Screen options={{ title: content.title }} />

      {/* Type badge */}
      <View style={styles.badgeContainer}>
        <Text style={styles.badge}>{typeLabel}</Text>
      </View>

      {/* Title */}
      <Text style={styles.title}>{content.title}</Text>

      {/* Meta */}
      <Text style={styles.meta}>
        {content.author}
        {content.publishedAt && ` · ${new Date(content.publishedAt).toLocaleDateString()}`}
      </Text>

      {/* Affiliate disclosure */}
      <View style={styles.disclosure}>
        <Text style={styles.disclosureText}>
          This page contains affiliate links. We may earn a commission on purchases made through
          these links at no extra cost to you.
        </Text>
      </View>

      {/* Body — simple text rendering for MVP */}
      <Text style={styles.body}>{content.bodyMarkdown}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafaf8",
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fafaf8",
  },
  badgeContainer: {
    flexDirection: "row",
    marginBottom: 12,
  },
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
  title: {
    fontSize: 28,
    fontWeight: "500",
    color: "#1a1a1a",
    lineHeight: 34,
    marginBottom: 8,
  },
  meta: {
    fontSize: 14,
    color: "#5a5a5a",
    marginBottom: 16,
  },
  disclosure: {
    backgroundColor: "#f0eeeb",
    borderRadius: 4,
    padding: 12,
    marginBottom: 24,
  },
  disclosureText: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#5a5a5a",
    lineHeight: 18,
  },
  body: {
    fontSize: 16,
    lineHeight: 26,
    color: "#3d3d3d",
  },
  errorText: {
    fontSize: 16,
    color: "#5a5a5a",
    marginBottom: 12,
  },
  backLink: {
    fontSize: 16,
    color: "#a68b4b",
    textDecorationLine: "underline",
  },
});
