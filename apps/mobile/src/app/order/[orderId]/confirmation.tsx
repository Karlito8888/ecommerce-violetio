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
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { createSupabaseClient, formatPrice } from "@ecommerce/shared";
import type { OrderDetail } from "@ecommerce/shared";

/** Edge Function base URL for order API calls. */
const EDGE_FN_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/cart`
  : "";

/**
 * Retrieves the Supabase session access token for Edge Function authorization.
 * The Edge Function requires a valid JWT for ALL routes, including GET /orders.
 *
 * ## Naming: `getSessionAccessToken` (not `getSessionToken`)
 * Code Review Fix H1: Renamed from `getSessionToken` to avoid shadowing the
 * `token` search param from `useLocalSearchParams` (guest lookup token) inside
 * the `fetchOrder` callback. The two tokens serve completely different purposes:
 * - **accessToken**: Supabase JWT for Edge Function auth headers
 * - **token** (search param): Guest order lookup token for tracking
 *
 * @see supabase/functions/cart/index.ts — validateUser() gate
 */
async function getSessionAccessToken(): Promise<string | null> {
  const supabase = createSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function OrderConfirmationScreen() {
  const { orderId, token } = useLocalSearchParams<{ orderId: string; token?: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /**
   * Guest token "copy" handler (Code Review Note L1).
   *
   * Uses Alert.alert() as a workaround because `expo-clipboard` is not installed.
   * This shows the full token in a native dialog so the user can manually copy it.
   * Not ideal UX — a true clipboard copy would be better.
   *
   * TODO(Story 5.4): Install expo-clipboard and use `Clipboard.setStringAsync(url)`
   * when implementing the full guest order lookup flow.
   */
  const handleCopyToken = () => {
    if (!token) return;
    const url = `${process.env.EXPO_PUBLIC_WEB_URL ?? ""}/order/lookup?token=${token}`;
    Alert.alert("Save Your Tracking Link", url, [{ text: "OK" }]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchOrder = useCallback(async () => {
    if (!orderId || !EDGE_FN_BASE) {
      setError("Order ID or configuration missing.");
      setIsLoading(false);
      return;
    }

    try {
      const accessToken = await getSessionAccessToken();
      if (!accessToken) {
        setError("Not authenticated. Please restart the app.");
        setIsLoading(false);
        return;
      }

      const res = await fetch(`${EDGE_FN_BASE}/orders/${orderId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
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
              <ThemedText style={styles.emailNotice}>
                A confirmation email will be sent to your email address shortly.
              </ThemedText>
            </ThemedView>

            {/* ── Guest order tracking token (Story 5.1) ── */}
            {token && (
              <ThemedView style={styles.guestTokenCard}>
                <ThemedText style={styles.sectionTitle}>SAVE YOUR TRACKING LINK</ThemedText>
                <ThemedText style={styles.guestTokenHint}>
                  Since you checked out as a guest, save this token to track your order later. This
                  is the only time it will be shown.
                </ThemedText>
                <View style={styles.guestTokenRow}>
                  <ThemedText style={styles.guestTokenValue} numberOfLines={1}>
                    {token.slice(0, 20)}...
                  </ThemedText>
                  <Pressable style={styles.guestTokenCopy} onPress={handleCopyToken}>
                    <ThemedText style={styles.guestTokenCopyText}>
                      {copied ? "Copied!" : "Copy"}
                    </ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            )}

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
              <Pressable style={styles.ctaButtonContainer} onPress={() => router.replace("/")}>
                <ThemedText style={styles.ctaButton}>Continue Shopping</ThemedText>
              </Pressable>
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
  emailNotice: { fontSize: 13, opacity: 0.5, marginTop: Spacing.two, textAlign: "center" },
  guestTokenCard: {
    borderWidth: 1,
    borderColor: "#e8e4df",
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    backgroundColor: "#FAF8F5",
  },
  guestTokenHint: { fontSize: 13, opacity: 0.6, lineHeight: 20, marginBottom: Spacing.two },
  guestTokenRow: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  guestTokenValue: {
    flex: 1,
    fontFamily: "monospace" as const,
    fontSize: 13,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e8e4df",
    borderRadius: 8,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  guestTokenCopy: {
    backgroundColor: "#2c2c2c",
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
  },
  guestTokenCopyText: { color: "#fff", fontSize: 13, fontWeight: "600" },
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
  ctaButtonContainer: {
    backgroundColor: "#2c2c2c",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
    alignItems: "center",
  },
  ctaButton: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  trackingHint: {
    marginTop: Spacing.three,
    fontSize: 13,
    opacity: 0.5,
    textAlign: "center",
  },
});
