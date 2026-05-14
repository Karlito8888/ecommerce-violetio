/**
 * Mobile Order Detail Screen — /orders/:orderId
 *
 * Displays the full order with per-merchant bag tracking and Realtime updates.
 * This is the mobile equivalent of the web's /account/orders/$orderId page.
 *
 * ## Data loading
 * - Uses TanStack Query with `orderDetailQueryOptions` (shared with web)
 * - Fetches via `fetchOrderDetailMobile()` → GET /api/orders/:orderId?source=supabase
 * - Realtime subscription via `useOrderRealtime` (shared hook)
 *
 * ## Realtime updates
 * When a webhook (BAG_SHIPPED, ORDER_COMPLETED, BAG_REFUNDED, etc.) updates the
 * Supabase DB, the Realtime subscription invalidates the TanStack Query cache.
 * The user sees live status changes (SHIPPED → DELIVERED, tracking numbers, refunds)
 * without manually refreshing.
 *
 * ## Data source
 * Supabase (NOT Violet API). Same as the web's order detail page.
 * This ensures consistency with webhook-persisted data and enables RLS-protected access.
 *
 * ## Displayed info
 * - Order header: ID, date, overall status
 * - Per-merchant bags: status, items, tracking, refund notices
 * - Pricing breakdown: subtotal, shipping, tax, total
 *
 * @see apps/web/src/routes/account/orders/$orderId.tsx — web equivalent
 * @see packages/shared/src/hooks/useOrders.ts — shared query options + Realtime hook
 * @see apps/mobile/src/server/getOrders.ts — mobile fetch functions
 */

import React, { useCallback } from "react";
import {
  ScrollView,
  Pressable,
  ActivityIndicator,
  View,
  StyleSheet,
  RefreshControl,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSupabaseClient,
  useOrderRealtime,
  BAG_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  formatPrice,
  formatDate,
  getBagStatusSummary,
} from "@ecommerce/shared";
import type { OrderBagWithItems } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { colors } from "@ecommerce/ui";
import { useAuth } from "@/context/AuthContext";
import { fetchOrderDetailMobile } from "@/server/getOrders";
import { orderDetailQueryOptions } from "@ecommerce/shared";

const supabase = createSupabaseClient();

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Renders tracking info for a SHIPPED bag. */
function TrackingInfo({ bag }: { bag: OrderBagWithItems }) {
  if (bag.status !== "SHIPPED" || !bag.tracking_number) return null;

  return (
    <View style={styles.trackingRow}>
      {bag.carrier && (
        <ThemedText type="small" themeColor="textSecondary">
          {bag.carrier} — #{bag.tracking_number}
        </ThemedText>
      )}
      {!bag.carrier && (
        <ThemedText type="small" themeColor="textSecondary">
          Tracking #{bag.tracking_number}
        </ThemedText>
      )}
      {bag.tracking_url ? (
        <Pressable onPress={() => void Linking.openURL(bag.tracking_url!).catch(() => {})}>
          <ThemedText type="small" style={styles.trackingLink}>
            Track →
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Renders refund info for REFUNDED/PARTIALLY_REFUNDED bags. */
function RefundNotice({ bag, currency }: { bag: OrderBagWithItems; currency: string }) {
  if (bag.order_refunds.length === 0) return null;
  const totalRefunded = bag.order_refunds.reduce((sum, r) => sum + r.amount, 0);
  const firstReason = bag.order_refunds.find((r) => r.reason)?.reason;

  return (
    <View style={styles.refundRow}>
      <ThemedText type="small" themeColor="textSecondary">
        Refund of {formatPrice(totalRefunded, currency)} processed
        {firstReason ? ` — ${firstReason}` : ""}
      </ThemedText>
    </View>
  );
}

/** Renders a single merchant bag card. */
function BagCard({ bag, currency }: { bag: OrderBagWithItems; currency: string }) {
  const statusLabel = BAG_STATUS_LABELS[bag.status] ?? bag.status;
  const statusColor =
    bag.status === "COMPLETED"
      ? colors.success
      : bag.status === "SHIPPED"
        ? colors.info
        : bag.status === "CANCELED" ||
            bag.status === "REFUNDED" ||
            bag.status === "PARTIALLY_REFUNDED"
          ? colors.error
          : colors.gold;

  return (
    <View style={styles.bagCard}>
      {/* Header */}
      <View style={styles.bagHeader}>
        <ThemedText type="default" style={styles.merchantName}>
          {bag.merchant_name || "Merchant"}
        </ThemedText>
        <View style={[styles.bagStatusBadge, { backgroundColor: statusColor }]}>
          <ThemedText type="small" style={styles.bagStatusText}>
            {statusLabel}
          </ThemedText>
        </View>
      </View>

      {/* Items */}
      {bag.order_items.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          {item.thumbnail ? (
            <Image
              source={{ uri: item.thumbnail }}
              style={styles.itemImage}
              contentFit="cover"
              recyclingKey={item.thumbnail}
            />
          ) : (
            <View style={styles.itemImagePlaceholder} />
          )}
          <View style={styles.itemInfo}>
            <ThemedText type="default">{item.name}</ThemedText>
            {item.quantity > 1 && (
              <ThemedText type="small" themeColor="textSecondary">
                Qty: {item.quantity}
              </ThemedText>
            )}
          </View>
          <ThemedText type="default">{formatPrice(item.line_price, currency)}</ThemedText>
        </View>
      ))}

      {/* Tracking */}
      <TrackingInfo bag={bag} />

      {/* Refund */}
      <RefundNotice bag={bag} currency={currency} />

      {/* Bag total */}
      <View style={styles.bagFooter}>
        <ThemedText type="small" themeColor="textSecondary">
          {bag.shipping_method ? `Via ${bag.shipping_method}` : ""}
        </ThemedText>
        <View style={styles.bagTotalContainer}>
          <ThemedText type="default" style={styles.bagTotal}>
            {formatPrice(bag.total, currency)}
          </ThemedText>
          {bag.order_refunds.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {` — Refund: ${formatPrice(
                bag.order_refunds.reduce((s, r) => s + r.amount, 0),
                currency,
              )}`}
            </ThemedText>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { user, isAnonymous } = useAuth();
  const queryClient = useQueryClient();

  // Realtime subscription for live order status updates
  useOrderRealtime(user?.id && !isAnonymous ? user.id : null, queryClient, supabase);

  const {
    data: order,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery(orderDetailQueryOptions(orderId ?? "", (id) => fetchOrderDetailMobile(id)));

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color={colors.gold} style={styles.loader} />
      </ThemedView>
    );
  }

  if (isError || !order) {
    return (
      <ThemedView style={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText type="default">← Back to Orders</ThemedText>
        </Pressable>
        <View style={styles.errorContainer}>
          <ThemedText themeColor="textSecondary" style={styles.errorText}>
            We couldn&apos;t load this order. Please try again.
          </ThemedText>
          <Pressable style={styles.retryButton} onPress={() => void refetch()}>
            <ThemedText type="default" style={styles.retryText}>
              Retry
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const overallStatusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;
  const hasMultipleBags = order.order_bags.length > 1;
  const bagStatuses = order.order_bags.map((b) => b.status);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
      >
        {/* Back navigation */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText type="default">← Back to Orders</ThemedText>
        </Pressable>

        {/* Order header */}
        <View style={styles.header}>
          <View>
            <ThemedText type="subtitle">Order #{order.id.slice(0, 8).toUpperCase()}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(order.created_at, "long")}
            </ThemedText>
          </View>
          <ThemedText type="default" style={styles.overallStatus}>
            {overallStatusLabel}
          </ThemedText>
        </View>

        {/* Mixed bag state summary */}
        {hasMultipleBags && new Set(bagStatuses).size > 1 && (
          <View style={styles.bagSummary}>
            <ThemedText type="small" themeColor="textSecondary">
              {getBagStatusSummary(bagStatuses, "SHIPPED")}
            </ThemedText>
          </View>
        )}

        {/* Per-merchant bags */}
        {order.order_bags.map((bag) => (
          <BagCard key={bag.id} bag={bag} currency={order.currency} />
        ))}

        {/* Pricing breakdown */}
        <View style={styles.pricing}>
          <ThemedText type="default" style={styles.sectionTitle}>
            Order Summary
          </ThemedText>
          <View style={styles.pricingRow}>
            <ThemedText type="default">Subtotal</ThemedText>
            <ThemedText type="default">{formatPrice(order.subtotal, order.currency)}</ThemedText>
          </View>
          <View style={styles.pricingRow}>
            <ThemedText type="default">Shipping</ThemedText>
            <ThemedText type="default">
              {formatPrice(order.shipping_total, order.currency)}
            </ThemedText>
          </View>
          <View style={styles.pricingRow}>
            <ThemedText type="default">Tax</ThemedText>
            <ThemedText type="default">{formatPrice(order.tax_total, order.currency)}</ThemedText>
          </View>
          <View style={[styles.pricingRow, styles.pricingRowTotal]}>
            <ThemedText type="subtitle">Total</ThemedText>
            <ThemedText type="subtitle">{formatPrice(order.total, order.currency)}</ThemedText>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  loader: {
    marginTop: Spacing.six,
  },
  backButton: {
    paddingVertical: Spacing.two,
    marginBottom: Spacing.three,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.four,
  },
  overallStatus: {
    fontWeight: "600",
    color: colors.gold,
  },
  bagSummary: {
    backgroundColor: colors.linen,
    padding: Spacing.three,
    borderRadius: 8,
    marginBottom: Spacing.three,
  },
  sectionTitle: {
    fontWeight: "600",
    marginBottom: Spacing.two,
  },
  bagCard: {
    backgroundColor: colors.linen,
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  bagHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.two,
  },
  merchantName: {
    fontWeight: "600",
    flex: 1,
  },
  bagStatusBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 6,
  },
  bagStatusText: {
    color: colors.ivory,
    fontSize: 11,
    fontWeight: "600",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.one,
  },
  itemInfo: {
    flex: 1,
    marginRight: Spacing.two,
  },
  trackingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: colors.stone,
  },
  trackingLink: {
    color: colors.gold,
    fontWeight: "600",
  },
  refundRow: {
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: colors.stone,
  },
  bagFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: colors.stone,
  },
  itemImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.stone,
  },
  itemImagePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.stone,
  },
  bagTotalContainer: {
    alignItems: "flex-end",
  },
  bagTotal: {
    fontWeight: "600",
  },
  pricing: {
    backgroundColor: colors.linen,
    borderRadius: 12,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.one,
  },
  pricingRowTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.stone,
    marginTop: Spacing.one,
    paddingTop: Spacing.two,
  },
  errorContainer: {
    marginTop: Spacing.six,
    alignItems: "center",
  },
  errorText: {
    textAlign: "center",
    marginBottom: Spacing.three,
  },
  retryButton: {
    backgroundColor: colors.gold,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  retryText: {
    color: colors.ivory,
    fontWeight: "600",
  },
});
