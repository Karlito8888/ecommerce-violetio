import { Stack, Link } from "expo-router";
import { View, FlatList, Pressable, ActivityIndicator, useColorScheme } from "react-native";
import { ThemedText } from "../../components/themed-text";
import { useState, useEffect } from "react";
import { Colors, Spacing } from "@/constants/theme";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

interface MerchantItem {
  merchant_id: string;
  name: string;
  platform: string | null;
  status: string;
}

export default function MerchantsScreen() {
  const [merchants, setMerchants] = useState<MerchantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scheme = useColorScheme();
  const colors = Colors[scheme === "unspecified" ? "light" : (scheme ?? "light")];

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get-merchants`, {
          headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "" },
        });
        const json = await res.json();

        if (json.error) {
          setError(json.error.message ?? "Failed to fetch merchants");
          setMerchants([]);
        } else {
          setMerchants(Array.isArray(json.data) ? json.data : []);
        }
      } catch {
        setError("Network error — please try again");
        setMerchants([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: "Merchants", headerBackTitle: "Back" }} />
      <View style={{ flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.three }}>
        <View style={{ marginBottom: Spacing.four }}>
          <ThemedText type="title">Our Merchants</ThemedText>
          <ThemedText type="small" style={{ color: colors.textSecondary, marginTop: 4 }}>
            Curated sellers from the world's best e-commerce platforms.
          </ThemedText>
        </View>

        {loading ? (
          <ActivityIndicator size="large" style={{ marginTop: 40 }} />
        ) : error ? (
          <ThemedText style={{ textAlign: "center", marginTop: 40, color: colors.textSecondary }}>
            {error}
          </ThemedText>
        ) : merchants.length === 0 ? (
          <ThemedText style={{ textAlign: "center", marginTop: 40, color: colors.textSecondary }}>
            No merchants connected yet. Check back soon!
          </ThemedText>
        ) : (
          <FlatList
            data={merchants}
            keyExtractor={(item) => item.merchant_id}
            contentContainerStyle={{ gap: Spacing.three, paddingBottom: 24 }}
            renderItem={({ item }) => (
              <Link href={`/merchants/${item.merchant_id}`} asChild>
                <Pressable
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: Spacing.three,
                    borderWidth: 1,
                    borderColor: colors.textSecondary + "30",
                    borderRadius: 10,
                    gap: Spacing.three,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: colors.backgroundElement,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ThemedText style={{ fontSize: 18, color: colors.tint }}>◉</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: "600", fontSize: 15 }}>{item.name}</ThemedText>
                    {item.platform && (
                      <ThemedText
                        type="small"
                        style={{ color: colors.textSecondary, textTransform: "capitalize" }}
                      >
                        {item.platform.charAt(0) + item.platform.slice(1).toLowerCase()}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText style={{ color: colors.textSecondary, fontSize: 20 }}>›</ThemedText>
                </Pressable>
              </Link>
            )}
          />
        )}
      </View>
    </>
  );
}
