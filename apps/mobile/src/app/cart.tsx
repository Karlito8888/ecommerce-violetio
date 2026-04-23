import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import type { Cart, Bag, CartItem } from "@ecommerce/shared";
import { apiGet, apiPut, apiDelete } from "@/server/apiClient";

/** Structured result type for API calls. */
interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

/** Key for persisting the Violet cart ID in SecureStore. */
const CART_KEY = "violet_cart_id";

/** Formats integer cents to a dollar string. */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Fetches the current cart from the web backend API.
 */
async function fetchCartFromApi(violetCartId: string): Promise<ApiResult<Cart>> {
  try {
    const json = await apiGet<{ data?: Cart; error?: { message?: string } }>(
      `/api/cart/${violetCartId}`,
    );
    return { data: json.data ?? null, error: json.error?.message ?? null };
  } catch {
    return { data: null, error: "Network error. Check your connection." };
  }
}

/**
 * Updates a cart item quantity via the web backend API.
 */
async function updateItemApi(
  violetCartId: string,
  skuId: string,
  quantity: number,
): Promise<ApiResult<Cart>> {
  try {
    const json = await apiPut<{ data?: Cart; error?: { message?: string } }>(
      `/api/cart/${violetCartId}/skus/${skuId}`,
      { quantity },
    );
    return { data: json.data ?? null, error: json.error?.message ?? null };
  } catch {
    return { data: null, error: "Network error. Check your connection." };
  }
}

/**
 * Removes a cart item via the web backend API.
 */
async function removeItemApi(violetCartId: string, skuId: string): Promise<ApiResult<Cart>> {
  try {
    const json = await apiDelete<{ data?: Cart; error?: { message?: string } }>(
      `/api/cart/${violetCartId}/skus/${skuId}`,
    );
    return { data: json.data ?? null, error: json.error?.message ?? null };
  } catch {
    return { data: null, error: "Network error. Check your connection." };
  }
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
        <ThemedText themeColor="textSecondary">{formatCents(bag.tax)}</ThemedText>
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
  const [cart, setCart] = useState<Cart | null>(null);
  const [violetCartId, setVioletCartId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Ref to track in-flight mutations without causing re-renders.
   * Using a ref instead of `isUpdating` state in dependency arrays prevents
   * unnecessary recreation of callbacks on every update cycle.
   */
  const isUpdatingRef = useRef(false);

  const totalItems =
    cart?.bags.reduce((sum, bag) => sum + bag.items.reduce((s, i) => s + i.quantity, 0), 0) ?? 0;

  // Load saved cart ID and fetch cart on mount
  useEffect(() => {
    async function init() {
      try {
        const savedId = await SecureStore.getItemAsync(CART_KEY);
        if (savedId) {
          setVioletCartId(savedId);
          const result = await fetchCartFromApi(savedId);
          if (result.error) {
            setError(result.error);
          } else {
            setCart(result.data);
          }
        }
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  /**
   * Updates item quantity in the cart via the web backend API.
   * Uses isUpdatingRef to guard against concurrent mutations without
   * adding isUpdating to the dependency array (which would cause re-renders).
   */
  const handleUpdateQty = useCallback(
    async (skuId: string, quantity: number) => {
      if (!violetCartId || isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      setIsUpdating(true);
      setError(null);
      try {
        const result = await updateItemApi(violetCartId, skuId, quantity);
        if (result.error) {
          Alert.alert("Error", result.error);
        } else if (result.data) {
          setCart(result.data);
        }
      } finally {
        isUpdatingRef.current = false;
        setIsUpdating(false);
      }
    },
    [violetCartId],
  );

  /**
   * Removes an item from the cart via the web backend API.
   * Uses isUpdatingRef to guard against concurrent mutations without
   * adding isUpdating to the dependency array (which would cause re-renders).
   */
  const handleRemove = useCallback(
    async (skuId: string) => {
      if (!violetCartId || isUpdatingRef.current) return;
      isUpdatingRef.current = true;
      setIsUpdating(true);
      setError(null);
      try {
        const result = await removeItemApi(violetCartId, skuId);
        if (result.error) {
          Alert.alert("Error", result.error);
        } else if (result.data) {
          setCart(result.data);
        }
      } finally {
        isUpdatingRef.current = false;
        setIsUpdating(false);
      }
    },
    [violetCartId],
  );

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

            {/**
             * Navigates to the checkout screen. Button is disabled during cart
             * update operations to prevent navigation with stale state.
             */}
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
