/**
 * Mobile Order List Screen — /orders
 *
 * Displays the authenticated user's order history with Realtime updates.
 * This is the mobile equivalent of the web's /account/orders page.
 *
 * ## Data loading
 * - Uses TanStack Query with `ordersQueryOptions` (shared with web)
 * - Fetches via `fetchOrdersMobile()` → GET /api/orders (web backend)
 * - Realtime subscription via `useOrderRealtime` (shared hook)
 *
 * ## Realtime updates
 * When a webhook (ORDER_COMPLETED, BAG_SHIPPED, etc.) updates the Supabase DB,
 * the Realtime subscription invalidates the TanStack Query cache, triggering
 * an automatic re-fetch. The user sees live status changes without manual refresh.
 *
 * ## Authentication
 * Only visible to authenticated (non-anonymous) users.
 * The API Route enforces auth + RLS ensures user-only access.
 *
 * ## UX states
 * - Loading: ActivityIndicator
 * - Empty: CTA to browse products
 * - Error: message with retry
 *
 * @see apps/web/src/routes/account/orders/index.tsx — web equivalent
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
} from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSupabaseClient,
  useOrderRealtime,
  ordersQueryOptions,
  ORDER_STATUS_LABELS,
  formatPrice,
  formatDate,
} from "@ecommerce/shared";
import type { OrderWithBagCount } from "@ecommerce/shared";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { colors } from "@ecommerce/ui";
import { useAuth } from "@/context/AuthContext";
import { fetchOrdersMobile } from "@/server/getOrders";

// Singleton Supabase client for Realtime (same instance as _layout.tsx)
const supabase = createSupabaseClient();

/**
 * Order list item card.
 *
 * Displays: date, status, truncated order ID, merchant count, and total.
 * Taps navigate to the order detail screen.
 */
function OrderCard({ order }: { order: OrderWithBagCount }) {
  const dateStr = formatDate(order.created_at, "short");

  const merchantText = order.bag_count === 1 ? "1 merchant" : `${order.bag_count} merchants`;
  const shortId = order.id.slice(0, 8).toUpperCase();

  // Simple status color mapping
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
      onPress={() => router.push(`/orders/${order.id}` as never)}
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
  const { user, isAnonymous } = useAuth();
  const queryClient = useQueryClient();

  // Realtime subscription for live order status updates
  useOrderRealtime(user?.id && !isAnonymous ? user.id : null, queryClient, supabase);

  const {
    data: orders,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery(ordersQueryOptions(() => fetchOrdersMobile()));

  // Pull-to-refresh handler
  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Not authenticated — show message
  if (isAnonymous || !user) {
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

      {isError && (
        <View style={styles.errorContainer}>
          <ThemedText themeColor="textSecondary" style={styles.errorText}>
            We couldn&apos;t load your orders. Please try again.
          </ThemedText>
          <Pressable style={styles.retryButton} onPress={() => void refetch()}>
            <ThemedText type="default" style={styles.retryText}>
              Retry
            </ThemedText>
          </Pressable>
        </View>
      )}

      {!isLoading && !isError && orders && (
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
              refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
            >
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </ScrollView>
          )}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    paddingTop: Spacing.six,
  },
  title: {
    marginBottom: Spacing.three,
  },
  loader: {
    marginTop: Spacing.six,
  },
  list: {
    paddingBottom: Spacing.six,
  },
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
  statusBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 6,
  },
  statusText: {
    color: colors.ivory,
    fontSize: 11,
    fontWeight: "600",
  },
  cardMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.one,
  },
  cardTotal: {
    fontWeight: "600",
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
  emptyContainer: {
    marginTop: Spacing.six,
    alignItems: "center",
  },
  emptyText: {
    textAlign: "center",
    marginBottom: Spacing.three,
  },
  browseButton: {
    backgroundColor: colors.gold,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 8,
  },
  browseText: {
    color: colors.ivory,
    fontWeight: "600",
  },
});
