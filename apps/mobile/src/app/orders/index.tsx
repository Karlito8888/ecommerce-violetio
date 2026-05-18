// apps/mobile/src/app/orders/index.tsx
//
// Mobile Order List Screen — migrated from Supabase to Convex queries (Phase 6).
//
// Uses Convex useQuery directly (reactive by default — no Realtime subscription needed).
// The Supabase client, useOrderRealtime, and TanStack Query are removed.

import React, { useCallback, useState } from "react";
import {
  ScrollView,
  Pressable,
  ActivityIndicator,
  View,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { ORDER_STATUS_LABELS, formatPrice, formatDate, type ConvexOrder } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { colors } from "@ecommerce/ui";
import { useAuth } from "@/context/AuthContext";
import { api } from "#convex/_generated/api";

function OrderCard({ order }: { order: ConvexOrder }) {
  const dateStr = formatDate(new Date(order._creationTime).toISOString(), "short");
  const bagCount = order.bags?.length ?? 0;
  const merchantText = bagCount === 1 ? "1 merchant" : `${bagCount} merchants`;
  const shortId = order.violetOrderId.slice(0, 8).toUpperCase();

  const statusColor =
    order.status === "COMPLETED"
      ? colors.success
      : order.status === "CANCELED" || order.status === "REFUNDED"
        ? colors.error
        : order.status === "SHIPPED" || order.status === "PARTIALLY_SHIPPED"
          ? colors.info
          : colors.gold;

  const statusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/orders/${order._id}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`Order ${shortId}, ${statusLabel}, ${merchantText}`}
    >
      <View style={styles.cardHeader}>
        <ThemedText type="small" themeColor="textSecondary">
          {dateStr}
        </ThemedText>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <ThemedText type="small" style={styles.statusText}>
            {statusLabel}
          </ThemedText>
        </View>
      </View>
      <View style={styles.cardMeta}>
        <ThemedText type="default">Order #{shortId}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {merchantText}
        </ThemedText>
      </View>
      <ThemedText type="subtitle" style={styles.cardTotal}>
        {formatPrice(order.total, order.currency)}
      </ThemedText>
    </Pressable>
  );
}

export default function OrdersScreen() {
  const { userId, isAuthenticated } = useAuth();

  // Convex query — reactive by default, no Realtime subscription needed
  const orders = useQuery(api.orders.queries.getOrders, userId ? { userId } : "skip");

  const isLoading = orders === undefined;

  // Note: Convex useQuery returns `undefined` while loading, then the data.
  // Errors are thrown (caught by ErrorBoundary), never returned as a value.
  // See: https://docs.convex.dev/client/react

  // Pull-to-refresh: Convex queries auto-update, but we can show a spinner.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Convex is reactive — just show the spinner briefly
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  if (!isAuthenticated) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle" style={styles.title}>
          My Orders
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.emptyText}>
          Sign in to view your order history.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.title}>
        My Orders
      </ThemedText>

      {isLoading && <ActivityIndicator size="large" color={colors.gold} style={styles.loader} />}

      {!isLoading && orders && (
        <>
          {orders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                You haven&apos;t placed any orders yet.
              </ThemedText>
              <Pressable style={styles.browseButton} onPress={() => router.push("/" as never)}>
                <ThemedText type="default" style={styles.browseText}>
                  Browse Products
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {orders.map((order: ConvexOrder) => (
                <OrderCard key={order._id} order={order} />
              ))}
            </ScrollView>
          )}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four, paddingTop: Spacing.six },
  title: { marginBottom: Spacing.three },
  loader: { marginTop: Spacing.six },
  list: { paddingBottom: Spacing.six },
  card: {
    backgroundColor: colors.linen,
    borderRadius: 12,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.one,
  },
  statusBadge: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 6 },
  statusText: { color: colors.ivory, fontSize: 11, fontWeight: "600" },
  cardMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.one,
  },
  cardTotal: { fontWeight: "600" },
  errorContainer: { marginTop: Spacing.six, alignItems: "center" },
  errorText: { textAlign: "center", marginBottom: Spacing.three },
  emptyContainer: { marginTop: Spacing.six, alignItems: "center" },
  emptyText: { textAlign: "center", marginBottom: Spacing.three },
  browseButton: {
    backgroundColor: colors.gold,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  browseText: { color: colors.ivory, fontWeight: "600" },
});
