import { useQuery } from "@tanstack/react-query";
import { Stack, Link } from "expo-router";
import { View, FlatList, Pressable, ActivityIndicator } from "react-native";
import type { MerchantRow } from "@ecommerce/shared";
import { ThemedText } from "../../components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { fetchMerchantsMobile } from "@/server/getMerchants";

// ─── Query ────────────────────────────────────────────────────────────

const merchantsQuery = {
  queryKey: ["merchants"],
  queryFn: fetchMerchantsMobile,
  staleTime: 5 * 60 * 1000,
};

// ─── Screen ───────────────────────────────────────────────────────────

export default function MerchantsScreen() {
  const theme = useTheme();
  const { data: result, isLoading, isError } = useQuery(merchantsQuery);
  const merchants: MerchantRow[] = result?.data ?? [];

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Merchants", headerBackTitle: "Back" }} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </>
    );
  }

  if (isError || result?.error) {
    return (
      <>
        <Stack.Screen options={{ title: "Merchants", headerBackTitle: "Back" }} />
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: Spacing.four }}
        >
          <ThemedText style={{ textAlign: "center", color: theme.textSecondary }}>
            Unable to load merchants.
          </ThemedText>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Merchants", headerBackTitle: "Back" }} />
      <View style={{ flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.three }}>
        <View style={{ marginBottom: Spacing.four }}>
          <ThemedText type="title">Our Merchants</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>
            Curated sellers from the world's best e-commerce platforms.
          </ThemedText>
        </View>

        {merchants.length === 0 ? (
          <ThemedText style={{ textAlign: "center", marginTop: 40, color: theme.textSecondary }}>
            No merchants connected yet. Check back soon!
          </ThemedText>
        ) : (
          <FlatList
            data={merchants}
            keyExtractor={(item) => item.merchant_id}
            contentContainerStyle={{ gap: Spacing.three, paddingBottom: 24 }}
            renderItem={({ item }) => <MerchantCard merchant={item} theme={theme} />}
          />
        )}
      </View>
    </>
  );
}

// ─── Merchant Card ────────────────────────────────────────────────────

interface MerchantCardProps {
  merchant: MerchantRow;
  theme: ReturnType<typeof useTheme>;
}

function MerchantCard({ merchant, theme }: MerchantCardProps) {
  return (
    <Link href={`/merchants/${merchant.merchant_id}`} asChild>
      <Pressable
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: Spacing.three,
          borderWidth: 1,
          borderColor: theme.textSecondary + "30",
          borderRadius: 10,
          gap: Spacing.three,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: theme.backgroundElement,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ThemedText style={{ fontSize: 18, color: theme.accent }}>◉</ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontWeight: "600", fontSize: 15 }}>{merchant.name}</ThemedText>
          {merchant.platform && (
            <ThemedText
              type="small"
              style={{ color: theme.textSecondary, textTransform: "capitalize" }}
            >
              {merchant.platform.charAt(0) + merchant.platform.slice(1).toLowerCase()}
            </ThemedText>
          )}
        </View>
        <ThemedText style={{ color: theme.textSecondary, fontSize: 20 }}>›</ThemedText>
      </Pressable>
    </Link>
  );
}
