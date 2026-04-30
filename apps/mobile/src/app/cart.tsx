import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import type { Bag, CartItem } from "@ecommerce/shared";
import { fetchCartMobile, updateCartItemMobile, removeCartItemMobile } from "@/server/getCart";

import { CART_STORAGE_KEY } from "../constants/cart";

/** Formats integer cents to a dollar string. */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CartItemRow({
  item,
  onUpdateQty,
  onRemove,
  isUpdating,
}: {
  item: CartItem;
  onUpdateQty: (skuId: string, qty: number) => void;
  onRemove: (skuId: string) => void;
  /** When true, disables qty buttons to prevent concurrent in-flight mutations. */
  isUpdating?: boolean;
}) {
  const lineTotal = item.unitPrice * item.quantity;

  const handleRemove = () => {
    Alert.alert("Remove item?", "Are you sure you want to remove this item from your bag?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => onRemove(item.skuId) },
    ]);
  };

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <ThemedText style={styles.itemName}>{item.name ?? `SKU ${item.skuId}`}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.itemPrice}>
          {formatCents(item.unitPrice)} × {item.quantity} = {formatCents(lineTotal)}
        </ThemedText>
      </View>
      <View style={styles.itemControls}>
        <View style={styles.qtyControls}>
          <TouchableOpacity
            onPress={() => onUpdateQty(item.skuId, item.quantity - 1)}
            disabled={item.quantity <= 1 || isUpdating}
            style={styles.qtyBtn}
            accessibilityLabel="Decrease quantity"
          >
            <ThemedText>−</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.qtyValue}>{item.quantity}</ThemedText>
          <TouchableOpacity
            onPress={() => onUpdateQty(item.skuId, item.quantity + 1)}
            disabled={isUpdating}
            style={styles.qtyBtn}
            accessibilityLabel="Increase quantity"
          >
            <ThemedText>+</ThemedText>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleRemove} disabled={isUpdating}>
          <ThemedText themeColor="textSecondary" style={styles.removeBtn}>
            Remove
          </ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function BagSection({
  bag,
  onUpdateQty,
  onRemove,
  isUpdating,
}: {
  bag: Bag;
  onUpdateQty: (skuId: string, qty: number) => void;
  onRemove: (skuId: string) => void;
  /** Propagated from CartScreen — disables qty controls during in-flight mutations. */
  isUpdating?: boolean;
}) {
  return (
    <View style={styles.bag}>
      <ThemedText style={styles.bagMerchant}>
        {bag.merchantName || `Merchant ${bag.merchantId}`}
      </ThemedText>
      {bag.errors.length > 0 &&
        bag.errors.map((err, i) => (
          <ThemedText key={i} style={styles.bagError}>
            {err.message}
          </ThemedText>
        ))}
      {bag.items.map((item) => (
        <CartItemRow
          key={item.skuId}
          item={item}
          onUpdateQty={onUpdateQty}
          onRemove={onRemove}
          isUpdating={isUpdating}
        />
      ))}
      <View style={styles.bagSubtotal}>
        <ThemedText themeColor="textSecondary">Subtotal</ThemedText>
        <ThemedText themeColor="textSecondary">{formatCents(bag.subtotal)}</ThemedText>
      </View>
      <View style={styles.bagSubtotal}>
        <ThemedText themeColor="textSecondary">Est. Tax</ThemedText>
        <ThemedText themeColor="textSecondary">
          {bag.tax > 0 ? formatCents(bag.tax) : "Calculated at checkout"}
        </ThemedText>
      </View>
      <View style={styles.bagSubtotal}>
        <ThemedText themeColor="textSecondary">Est. Shipping</ThemedText>
        <ThemedText themeColor="textSecondary">
          {bag.shippingTotal > 0 ? formatCents(bag.shippingTotal) : "Calculated at checkout"}
        </ThemedText>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CartScreen() {
  const [violetCartId, setVioletCartId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const queryClient = useQueryClient();

  // Load saved cart ID on mount
  useEffect(() => {
    (async () => {
      try {
        const savedId = await SecureStore.getItemAsync(CART_STORAGE_KEY);
        if (savedId) setVioletCartId(savedId);
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  // ─── Query: fetch cart ──────────────────────────────────────────

  const {
    data: cart,
    error: queryError,
    isLoading: isQueryLoading,
  } = useQuery({
    queryKey: ["cart", violetCartId],
    queryFn: async () => {
      if (!violetCartId) return null;
      const result = await fetchCartMobile(violetCartId);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!violetCartId,
    staleTime: 0, // Cart data should always be fresh
  });

  // ─── Mutations: update & remove ─────────────────────────────────

  const invalidateCart = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["cart", violetCartId] });
  }, [queryClient, violetCartId]);

  const updateMutation = useMutation({
    mutationFn: ({ skuId, quantity }: { skuId: string; quantity: number }) =>
      violetCartId
        ? updateCartItemMobile(violetCartId, skuId, quantity)
        : Promise.reject("No cart"),
    onSuccess: invalidateCart,
    onError: (err) => Alert.alert("Error", err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (skuId: string) =>
      violetCartId ? removeCartItemMobile(violetCartId, skuId) : Promise.reject("No cart"),
    onSuccess: invalidateCart,
    onError: (err) => Alert.alert("Error", err.message),
  });

  const isUpdating = updateMutation.isPending || removeMutation.isPending;

  const handleUpdateQty = useCallback(
    (skuId: string, quantity: number) => updateMutation.mutate({ skuId, quantity }),
    [updateMutation],
  );

  const handleRemove = useCallback(
    (skuId: string) => removeMutation.mutate(skuId),
    [removeMutation],
  );

  const totalItems =
    cart?.bags.reduce((sum, bag) => sum + bag.items.reduce((s, i) => s + i.quantity, 0), 0) ?? 0;

  const isLoading = initializing || isQueryLoading;
  const error = queryError?.message ?? null;

  return (
    <ThemedView ambient style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle" style={styles.title}>
          Your Bag{totalItems > 0 ? ` (${totalItems})` : ""}
        </ThemedText>

        {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

        {isLoading ? (
          <ThemedText themeColor="textSecondary">Loading your bag…</ThemedText>
        ) : !cart || cart.bags.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText style={styles.emptyIcon}>🛍</ThemedText>
            <ThemedText themeColor="textSecondary">Your bag is empty</ThemedText>
            <TouchableOpacity
              style={styles.startShoppingBtn}
              onPress={() => router.push("/")}
              accessibilityLabel="Start shopping"
            >
              <ThemedText style={styles.startShoppingText}>Start Shopping</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {cart.bags.map((bag) => (
              <BagSection
                key={bag.id}
                bag={bag}
                onUpdateQty={handleUpdateQty}
                onRemove={handleRemove}
                isUpdating={isUpdating}
              />
            ))}

            <View style={styles.totalRow}>
              <ThemedText style={styles.totalLabel}>Total</ThemedText>
              <ThemedText style={styles.totalValue}>{formatCents(cart.total)}</ThemedText>
            </View>

            <TouchableOpacity
              style={[styles.checkoutBtn, isUpdating && styles.checkoutBtnDisabled]}
              disabled={isUpdating}
              onPress={() => router.push("/checkout" as never)}
              accessibilityLabel="Proceed to checkout"
            >
              <ThemedText style={styles.checkoutBtnText}>Proceed to Checkout</ThemedText>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    padding: Spacing.four,
    paddingTop: Spacing.six,
  },
  title: { marginBottom: Spacing.four },
  scroll: { flex: 1 },
  empty: { alignItems: "center", marginTop: Spacing.six, gap: Spacing.two },
  emptyIcon: { fontSize: 48, opacity: 0.3 },
  errorText: { color: "#b54a4a", fontSize: 13, marginBottom: Spacing.two },
  startShoppingBtn: {
    backgroundColor: "#2c2c2c",
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    borderRadius: 4,
    marginTop: Spacing.two,
  },
  startShoppingText: { color: "#fafaf8", fontWeight: "600", fontSize: 14 },
  bag: {
    marginBottom: Spacing.six,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
    paddingBottom: Spacing.four,
  },
  bagMerchant: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    opacity: 0.6,
    marginBottom: Spacing.two,
  },
  bagError: {
    color: "#b54a4a",
    fontSize: 13,
    marginBottom: Spacing.two,
  },
  bagSubtotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.two,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  itemInfo: { flex: 1, gap: Spacing.one },
  itemName: { fontSize: 14, fontWeight: "500" },
  itemPrice: { fontSize: 13 },
  itemControls: { alignItems: "flex-end", gap: Spacing.two },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: Spacing.one },
  qtyBtn: { padding: Spacing.one, minWidth: 28, alignItems: "center" },
  qtyValue: { minWidth: 24, textAlign: "center" },
  removeBtn: { fontSize: 12 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.four,
    marginBottom: Spacing.four,
  },
  totalLabel: { fontSize: 16, fontWeight: "600" },
  totalValue: { fontSize: 16, fontWeight: "600" },
  checkoutBtn: {
    backgroundColor: "#2c2c2c",
    padding: Spacing.four,
    borderRadius: 4,
    alignItems: "center",
    marginBottom: Spacing.six,
  },
  checkoutBtnDisabled: { opacity: 0.6 },
  checkoutBtnText: { color: "#fafaf8", fontWeight: "600", fontSize: 14 },
});
