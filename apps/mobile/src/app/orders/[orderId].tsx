// apps/mobile/src/app/orders/[orderId].tsx
//
// Mobile Order Detail Screen — migrated from Supabase to Convex queries (Phase 6).
//
// Uses Convex useQuery for reactive order detail (no Realtime subscription needed).
// The orderId param is a Convex document ID (Id<"orders">).

import React, { useCallback, useState } from "react";
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
import { useQuery } from "convex/react";
import {
  BAG_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  formatPrice,
  formatDate,
  getBagStatusSummary,
} from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { colors } from "@ecommerce/ui";
import { api } from "#convex/_generated/api";
import type { Id } from "#convex/_generated/dataModel";

interface ConvexOrderBag {
  _id: string;
  merchantName: string;
  status: string;
  total: number;
  shippingMethod?: string;
  trackingUrl?: string;
  trackingNumber?: string;
  carrier?: string;
  items: {
    _id: string;
    name: string;
    quantity: number;
    price: number;
    linePrice: number;
    thumbnail?: string;
  }[];
  refunds: { _id: string; amount: number; reason?: string; status: string }[];
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TrackingInfo({ bag }: { bag: ConvexOrderBag }) {
  if (bag.status !== "SHIPPED" || !bag.trackingNumber) return null;

  return (
    <View style={styles.trackingRow}>
      {bag.carrier ? (
        <ThemedText type="small" themeColor="textSecondary">
          {bag.carrier} — #{bag.trackingNumber}
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Tracking #{bag.trackingNumber}
        </ThemedText>
      )}
      {bag.trackingUrl ? (
        <Pressable onPress={() => void Linking.openURL(bag.trackingUrl!).catch(() => {})}>
          <ThemedText type="small" style={styles.trackingLink}>
            Track →
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function RefundNotice({ bag, currency }: { bag: ConvexOrderBag; currency: string }) {
  if (bag.refunds.length === 0) return null;
  const totalRefunded = bag.refunds.reduce((sum, r) => sum + r.amount, 0);
  const firstReason = bag.refunds.find((r) => r.reason)?.reason;

  return (
    <View style={styles.refundRow}>
      <ThemedText type="small" themeColor="textSecondary">
        Refund of {formatPrice(totalRefunded, currency)} processed
        {firstReason ? ` — ${firstReason}` : ""}
      </ThemedText>
    </View>
  );
}

function BagCard({ bag, currency }: { bag: ConvexOrderBag; currency: string }) {
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
      <View style={styles.bagHeader}>
        <ThemedText type="default" style={styles.merchantName}>
          {bag.merchantName || "Merchant"}
        </ThemedText>
        <View style={[styles.bagStatusBadge, { backgroundColor: statusColor }]}>
          <ThemedText type="small" style={styles.bagStatusText}>
            {statusLabel}
          </ThemedText>
        </View>
      </View>

      {bag.items.map((item) => (
        <View key={item._id} style={styles.itemRow}>
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
          <ThemedText type="default">{formatPrice(item.linePrice, currency)}</ThemedText>
        </View>
      ))}

      <TrackingInfo bag={bag} />
      <RefundNotice bag={bag} currency={currency} />

      <View style={styles.bagFooter}>
        <ThemedText type="small" themeColor="textSecondary">
          {bag.shippingMethod ? `Via ${bag.shippingMethod}` : ""}
        </ThemedText>
        <View style={styles.bagTotalContainer}>
          <ThemedText type="default" style={styles.bagTotal}>
            {formatPrice(bag.total, currency)}
          </ThemedText>
          {bag.refunds.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {` — Refund: ${formatPrice(
                bag.refunds.reduce((s, r) => s + r.amount, 0),
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
  const [refreshing, setRefreshing] = useState(false);

  // Convex query — reactive by default (no Realtime subscription needed)
  const order = useQuery(api.orders.queries.getOrderDetail, {
    orderId: orderId as Id<"orders">,
  });

  const isLoading = order === undefined;
  const isError = order instanceof Error;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

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
        </View>
      </ThemedView>
    );
  }

  const overallStatusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;
  const bags = order.bags ?? [];
  const hasMultipleBags = bags.length > 1;
  const bagStatuses = bags.map((b) => b.status);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ThemedText type="default">← Back to Orders</ThemedText>
        </Pressable>

        <View style={styles.header}>
          <View>
            <ThemedText type="subtitle">
              Order #{order.violetOrderId.slice(0, 8).toUpperCase()}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(new Date(order._creationTime).toISOString(), "long")}
            </ThemedText>
          </View>
          <ThemedText type="default" style={styles.overallStatus}>
            {overallStatusLabel}
          </ThemedText>
        </View>

        {hasMultipleBags && new Set(bagStatuses).size > 1 && (
          <View style={styles.bagSummary}>
            <ThemedText type="small" themeColor="textSecondary">
              {getBagStatusSummary(bagStatuses, "SHIPPED")}
            </ThemedText>
          </View>
        )}

        {bags.map((bag: ConvexOrderBag) => (
          <BagCard key={bag._id} bag={bag} currency={order.currency} />
        ))}

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
              {formatPrice(order.shippingTotal, order.currency)}
            </ThemedText>
          </View>
          <View style={styles.pricingRow}>
            <ThemedText type="default">Tax</ThemedText>
            <ThemedText type="default">{formatPrice(order.taxTotal, order.currency)}</ThemedText>
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
  container: { flex: 1 },
  scrollContent: { padding: Spacing.four, paddingBottom: Spacing.six },
  loader: { marginTop: Spacing.six },
  backButton: { paddingVertical: Spacing.two, marginBottom: Spacing.three },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.four,
  },
  overallStatus: { fontWeight: "600", color: colors.gold },
  bagSummary: {
    backgroundColor: colors.linen,
    padding: Spacing.three,
    borderRadius: 8,
    marginBottom: Spacing.three,
  },
  sectionTitle: { fontWeight: "600", marginBottom: Spacing.two },
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
  merchantName: { fontWeight: "600", flex: 1 },
  bagStatusBadge: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 6 },
  bagStatusText: { color: colors.ivory, fontSize: 11, fontWeight: "600" },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.one,
  },
  itemInfo: { flex: 1, marginRight: Spacing.two },
  trackingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: colors.stone,
  },
  trackingLink: { color: colors.gold, fontWeight: "600" },
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
  itemImage: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.stone },
  itemImagePlaceholder: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.stone },
  bagTotalContainer: { alignItems: "flex-end" },
  bagTotal: { fontWeight: "600" },
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
  errorContainer: { marginTop: Spacing.six, alignItems: "center" },
  errorText: { textAlign: "center", marginBottom: Spacing.three },
});
