import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import type { CollectionItem } from "@ecommerce/shared";
import { optimizeWithPreset } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { fetchCollectionsMobile } from "@/server/getCollections";

// ─── Query ────────────────────────────────────────────────────────────

const collectionsQuery = {
  queryKey: ["collections"],
  queryFn: fetchCollectionsMobile,
  staleTime: 5 * 60 * 1000,
};

// ─── Screen ───────────────────────────────────────────────────────────

export default function CollectionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: result, isLoading, isError } = useQuery(collectionsQuery);
  const collections = result?.data ?? [];

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: "Collections" }} />
        <ActivityIndicator size="large" color={theme.tint} />
      </ThemedView>
    );
  }

  if (isError || result?.error) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: "Collections" }} />
        <ThemedText themeColor="textSecondary" style={styles.emptyText}>
          Unable to load collections.
        </ThemedText>
      </ThemedView>
    );
  }

  if (collections.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: "Collections" }} />
        <ThemedText themeColor="textSecondary" style={styles.emptyText}>
          No collections available yet.
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.emptyHint}>
          Collections are synced daily from our merchants.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: "Collections" }} />
      <FlatList
        data={collections}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <CollectionCard
            collection={item}
            onPress={() => router.push(`/collections/${item.id}` as never)}
            theme={theme}
          />
        )}
        ListHeaderComponent={
          <ThemedText style={styles.subtitle} themeColor="textSecondary">
            Curated selections from our merchant partners.
          </ThemedText>
        }
      />
    </ThemedView>
  );
}

// ─── Collection Card ─────────────────────────────────────────────────

interface CollectionCardProps {
  collection: CollectionItem;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}

function CollectionCard({ collection, onPress, theme }: CollectionCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${collection.name} collection`}
    >
      {/* Image */}
      <View style={styles.imageWrap}>
        {collection.imageUrl ? (
          <Image
            source={{ uri: optimizeWithPreset(collection.imageUrl, "collectionCard") ?? undefined }}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel={collection.name}
          />
        ) : (
          <View
            style={[styles.imagePlaceholder, { backgroundColor: Colors.light.backgroundElement }]}
          >
            <ThemedText style={styles.placeholderIcon}>✦</ThemedText>
          </View>
        )}
        {/* Type badge */}
        <View style={styles.badge}>
          <ThemedText style={styles.badgeText}>
            {collection.type === "AUTOMATED" ? "Auto" : "Curated"}
          </ThemedText>
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <ThemedText style={styles.name} numberOfLines={2}>
          {collection.name}
        </ThemedText>
        {collection.description ? (
          <ThemedText style={styles.description} themeColor="textSecondary" numberOfLines={2}>
            {collection.description}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.four },
  list: { padding: Spacing.three, gap: Spacing.three },
  row: { gap: Spacing.three },
  subtitle: { fontSize: 14, marginBottom: Spacing.three, textAlign: "center" },
  emptyText: { fontSize: 15, textAlign: "center", fontStyle: "italic" },
  emptyHint: { fontSize: 13, textAlign: "center", marginTop: Spacing.two },

  card: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  imageWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: 4 / 3,
  },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderIcon: { fontSize: 28, opacity: 0.3 },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  body: { padding: Spacing.three },
  name: { fontSize: 14, fontWeight: "600", marginBottom: 2, lineHeight: 18 },
  description: { fontSize: 12, lineHeight: 16 },
});
