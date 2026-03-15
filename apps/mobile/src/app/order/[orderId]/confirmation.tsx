/**
 * Order Confirmation Screen — the mobile "Post-Purchase Wow Moment".
 *
 * ## Architecture
 * Fetches order details from the Supabase Edge Function (GET /orders/{orderId}),
 * which proxies to Violet's GET /orders/{id}. The orderId is passed via the
 * URL parameter from the checkout screen after successful submission.
 *
 * ## Data source
 * Unlike web (which uses a TanStack Start loader for SSR), mobile fetches
 * client-side on mount. The Edge Function base URL is the same as checkout
 * but uses a different path (/orders/{id} instead of /cart/{id}).
 *
 * @see supabase/functions/cart/index.ts — Edge Function routes (Task 8 adds GET /orders)
 * @see apps/web/src/routes/order/$orderId/confirmation.tsx — web equivalent
 * @see Story 4.5 — Payment Confirmation & 3D Secure Handling
 */

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { createSupabaseClient, formatPrice } from "@ecommerce/shared";

/** Edge Function base URL for order API calls. */
const EDGE_FN_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/cart`
  : "";

/**
 * Retrieves the Supabase session access token for Edge Function authorization.
 * The Edge Function requires a valid JWT for ALL routes, including GET /orders.
 *
 * @see supabase/functions/cart/index.ts — validateUser() gate
 */
async function getSessionToken(): Promise<string | null> {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Order detail shape returned by the Edge Function.
 * Mirrors the web's `OrderDetail` type from `@ecommerce/shared`.
 */
interface MobileOrderDetail {
  id: string;
  status: string;
  currency: string;
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  bags: Array<{
    id: string;
    merchantName: string;
    status: string;
    items: Array<{
      skuId: string;
      name: string;
      quantity: number;
      price: number;
      linePrice: number;
      thumbnail?: string;
    }>;
    subtotal: number;
    shippingTotal: number;
    taxTotal: number;
    total: number;
    shippingMethod?: { carrier: string; label: string };
  }>;
  customer: { email: string; firstName: string; lastName: string };
  shippingAddress: {
    address1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  dateSubmitted?: string;
}

export default function OrderConfirmationScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<MobileOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId || !EDGE_FN_BASE) {
      setError("Order ID or configuration missing.");
      setIsLoading(false);
      return;
    }

    try {
      const token = await getSessionToken();
      if (!token) {
        setError("Not authenticated. Please restart the app.");
        setIsLoading(false);
        return;
      }

      const res = await fetch(`${EDGE_FN_BASE}/orders/${orderId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(`Failed to load order (${res.status}).`);
        setIsLoading(false);
        return;
      }

      const json = await res.json();
      if (json.error) {
        setError(json.error.message ?? "Order not found.");
      } else {
        setOrder(json.data);
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <Stack.Screen options={{ title: "Order Confirmed", headerBackVisible: false }} />
      <ScrollView contentContainerStyle={styles.container}>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <ThemedText style={styles.loadingText}>Loading order details...</ThemedText>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <ThemedText style={styles.errorHeading}>Order Not Found</ThemedText>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {order && (
          <>
            {/* ── Success header ── */}
            <ThemedView style={styles.header}>
              <View style={styles.successIcon}>
                <ThemedText style={styles.successIconText}>✓</ThemedText>
              </View>
              <ThemedText style={styles.heading}>Order Confirmed</ThemedText>
              <ThemedText style={styles.subheading}>Thank you for your purchase!</ThemedText>
              <ThemedText style={styles.orderId}>Order #{order.id}</ThemedText>
            </ThemedView>

            {/* ── Per-merchant bags ── */}
            {order.bags.map((bag) => (
              <ThemedView key={bag.id} style={styles.bagCard}>
                <View style={styles.bagHeader}>
                  <ThemedText style={styles.merchantName}>
                    {bag.merchantName || "Merchant"}
                  </ThemedText>
                  <ThemedText style={styles.bagStatus}>{bag.status}</ThemedText>
                </View>

                {bag.items.map((item) => (
                  <View key={item.skuId} style={styles.itemRow}>
                    {item.thumbnail ? (
                      <Image
                        source={{ uri: item.thumbnail }}
                        style={styles.itemImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.itemImagePlaceholder} />
                    )}
                    <View style={styles.itemDetails}>
                      <ThemedText style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </ThemedText>
                      {item.quantity > 1 && (
                        <ThemedText style={styles.itemQty}>Qty: {item.quantity}</ThemedText>
                      )}
                    </View>
                    <ThemedText style={styles.itemPrice}>
                      {formatPrice(item.linePrice, order.currency)}
                    </ThemedText>
                  </View>
                ))}
              </ThemedView>
            ))}

            {/* ── Price breakdown ── */}
            <ThemedView style={styles.pricingCard}>
              <ThemedText style={styles.sectionTitle}>ORDER SUMMARY</ThemedText>
              <View style={styles.pricingRow}>
                <ThemedText style={styles.pricingLabel}>Subtotal</ThemedText>
                <ThemedText style={styles.pricingValue}>
                  {formatPrice(order.subtotal, order.currency)}
                </ThemedText>
              </View>
              <View style={styles.pricingRow}>
                <ThemedText style={styles.pricingLabel}>Shipping</ThemedText>
                <ThemedText style={styles.pricingValue}>
                  {formatPrice(order.shippingTotal, order.currency)}
                </ThemedText>
              </View>
              <View style={styles.pricingRow}>
                <ThemedText style={styles.pricingLabel}>Tax</ThemedText>
                <ThemedText style={styles.pricingValue}>
                  {formatPrice(order.taxTotal, order.currency)}
                </ThemedText>
              </View>
              <View style={[styles.pricingRow, styles.pricingRowTotal]}>
                <ThemedText style={styles.pricingTotalLabel}>Total</ThemedText>
                <ThemedText style={styles.pricingTotalValue}>
                  {formatPrice(order.total, order.currency)}
                </ThemedText>
              </View>
            </ThemedView>

            {/* ── Shipping address ── */}
            <ThemedView style={styles.addressCard}>
              <ThemedText style={styles.sectionTitle}>SHIPPING ADDRESS</ThemedText>
              <ThemedText style={styles.addressText}>
                {order.customer.firstName} {order.customer.lastName}
              </ThemedText>
              <ThemedText style={styles.addressText}>{order.shippingAddress.address1}</ThemedText>
              <ThemedText style={styles.addressText}>
                {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                {order.shippingAddress.postalCode}
              </ThemedText>
            </ThemedView>

            {/* ── Continue shopping button ── */}
            <View style={styles.ctaContainer}>
              <ThemedText style={styles.ctaButton} onPress={() => router.push("/")}>
                Continue Shopping
              </ThemedText>
              <ThemedText style={styles.trackingHint}>
                Order tracking will be available once your items ship.
              </ThemedText>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: Spacing.four },
  loadingContainer: { alignItems: "center", paddingTop: Spacing.six },
  loadingText: { marginTop: Spacing.three, fontSize: 14, opacity: 0.6 },
  errorContainer: { alignItems: "center", paddingTop: Spacing.six },
  errorHeading: { fontSize: 20, fontWeight: "700", marginBottom: Spacing.two },
  errorText: { fontSize: 14, opacity: 0.6, textAlign: "center" },
  header: { alignItems: "center", paddingVertical: Spacing.five, marginBottom: Spacing.four },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#5A7A4A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.three,
  },
  successIconText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  heading: { fontSize: 24, fontWeight: "700", marginBottom: Spacing.one },
  subheading: { fontSize: 15, opacity: 0.6 },
  orderId: { fontSize: 13, opacity: 0.5, marginTop: Spacing.one },
  bagCard: {
    borderWidth: 1,
    borderColor: "#e8e4df",
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  bagHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: "#e8e4df",
    marginBottom: Spacing.two,
  },
  merchantName: { fontSize: 14, fontWeight: "600" },
  bagStatus: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    color: "#5A7A4A",
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  itemImage: { width: 40, height: 40, borderRadius: 6 },
  itemImagePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: "#e8e4df",
  },
  itemDetails: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: "500" },
  itemQty: { fontSize: 12, opacity: 0.5 },
  itemPrice: { fontSize: 14, fontWeight: "600" },
  pricingCard: {
    borderWidth: 1,
    borderColor: "#e8e4df",
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    opacity: 0.5,
    marginBottom: Spacing.two,
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.one,
  },
  pricingLabel: { fontSize: 14, opacity: 0.7 },
  pricingValue: { fontSize: 14 },
  pricingRowTotal: {
    borderTopWidth: 1,
    borderTopColor: "#e8e4df",
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
  },
  pricingTotalLabel: { fontSize: 16, fontWeight: "700" },
  pricingTotalValue: { fontSize: 16, fontWeight: "700" },
  addressCard: {
    borderWidth: 1,
    borderColor: "#e8e4df",
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  addressText: { fontSize: 14, lineHeight: 22, opacity: 0.8 },
  ctaContainer: { alignItems: "center", paddingTop: Spacing.three },
  ctaButton: {
    backgroundColor: "#2c2c2c",
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
    overflow: "hidden",
    textAlign: "center",
  },
  trackingHint: {
    marginTop: Spacing.three,
    fontSize: 13,
    opacity: 0.5,
    textAlign: "center",
  },
});
