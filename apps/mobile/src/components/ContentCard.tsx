import { StyleSheet, TouchableOpacity, View, Image } from "react-native";
import { useRouter } from "expo-router";
import type { ContentListItem } from "@ecommerce/shared";
import { CONTENT_TYPE_LABELS } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { Colors, Spacing } from "@/constants/theme";

interface ContentCardProps {
  /** Uses ContentListItem since the listing query excludes body_markdown for performance. */
  content: ContentListItem;
  /** Compact mode for horizontal scroll lists (smaller card). */
  compact?: boolean;
}

/**
 * Content card component for mobile.
 *
 * Used in two contexts:
 * - **Compact** (horizontal scroll on home tab): 200px wide, image + title + badge
 * - **Full** (vertical list on content listing): full width, image + badge + title + excerpt
 */
export default function ContentCard({ content, compact = false }: ContentCardProps) {
  const router = useRouter();

  const handlePress = () => {
    router.push(`/content/${content.slug}` as never);
  };

  if (compact) {
    return (
      <TouchableOpacity
        style={styles.compactCard}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Read ${content.title}`}
      >
        {content.featuredImageUrl ? (
          <Image
            source={{ uri: content.featuredImageUrl }}
            style={styles.compactImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.compactImage, styles.compactPlaceholder]}>
            <ThemedText type="small" style={styles.placeholderText}>
              {CONTENT_TYPE_LABELS[content.type] || content.type}
            </ThemedText>
          </View>
        )}
        <View style={styles.compactBody}>
          <ThemedText type="small" style={styles.badge}>
            {CONTENT_TYPE_LABELS[content.type] || content.type}
          </ThemedText>
          <ThemedText style={styles.compactTitle} numberOfLines={2}>
            {content.title}
          </ThemedText>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.fullCard}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Read ${content.title}`}
    >
      {content.featuredImageUrl ? (
        <Image
          source={{ uri: content.featuredImageUrl }}
          style={styles.fullImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.fullImage, styles.fullPlaceholder]}>
          <ThemedText style={styles.placeholderText}>
            {CONTENT_TYPE_LABELS[content.type] || content.type}
          </ThemedText>
        </View>
      )}
      <View style={styles.fullBody}>
        <ThemedText type="small" style={styles.badge}>
          {CONTENT_TYPE_LABELS[content.type] || content.type}
        </ThemedText>
        <ThemedText style={styles.fullTitle} numberOfLines={2}>
          {content.title}
        </ThemedText>
        <ThemedText type="small" style={styles.author}>
          {content.author}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  /* ─── Compact card (horizontal scroll) ─── */
  compactCard: {
    width: 200,
    borderRadius: Spacing.two,
    overflow: "hidden",
    backgroundColor: Colors.light.backgroundElement,
  },
  compactImage: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  compactPlaceholder: {
    backgroundColor: Colors.light.backgroundSelected,
    alignItems: "center",
    justifyContent: "center",
  },
  compactBody: {
    padding: Spacing.two,
    gap: Spacing.one,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },

  /* ─── Full card (vertical list) ─── */
  fullCard: {
    borderRadius: Spacing.two,
    overflow: "hidden",
    backgroundColor: Colors.light.backgroundElement,
    marginBottom: Spacing.three,
  },
  fullImage: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  fullPlaceholder: {
    backgroundColor: Colors.light.backgroundSelected,
    alignItems: "center",
    justifyContent: "center",
  },
  fullBody: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  fullTitle: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },

  /* ─── Shared ─── */
  badge: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.light.textSecondary,
  },
  author: {
    color: Colors.light.textSecondary,
    marginTop: Spacing.one,
  },
  placeholderText: {
    color: Colors.light.textSecondary,
    fontSize: 12,
  },
});
