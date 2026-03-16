/**
 * Guest Order Lookup Screen — /order/lookup
 *
 * React Native implementation of the guest order lookup feature (AC: #1, #2, #3, #6, #7).
 * Mirrors the web route `/order/lookup` but uses React Native components and
 * calls the `guest-order-lookup` Supabase Edge Function (mobile cannot call
 * TanStack Start Server Functions directly).
 *
 * ## Two entry paths
 *
 * 1. **Token-based**: URL param `?token=<value>` triggers auto-lookup on mount.
 * 2. **Email-based**: Guest enters email → receives 6-digit OTP → views their orders.
 *
 * ## Session cleanup
 * After OTP verification and fetching orders, we immediately sign out to prevent
 * leaving a stale Supabase session the guest doesn't know about.
 */

import React, { useState, useEffect } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  createSupabaseClient,
  formatPrice,
  formatDate,
  ORDER_STATUS_LABELS,
  BAG_STATUS_LABELS,
} from "@ecommerce/shared";
import { colors, spacing, typography } from "@ecommerce/ui";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  line_price: number;
  thumbnail: string | null;
}

interface OrderRefund {
  id: string;
  amount: number;
  reason: string | null;
  currency: string;
}

interface OrderBag {
  id: string;
  merchant_name: string | null;
  status: string;
  total: number;
  tracking_url: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipping_method: string | null;
  order_items: OrderItem[];
  order_refunds?: OrderRefund[];
}

interface GuestOrder {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  currency: string;
  created_at: string;
  order_bags: OrderBag[];
}

type LookupStep =
  | { step: "email" }
  | { step: "verify"; email: string }
  | { step: "results"; orders: GuestOrder[] }
  | { step: "token-result"; order: GuestOrder };

// ─── Edge Function client ──────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/guest-order-lookup`;

async function lookupByToken(token: string): Promise<GuestOrder | null> {
  const res = await fetch(EDGE_FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "token", token }),
  });
  if (!res.ok) throw new Error(`Token lookup failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? null;
}

async function lookupByEmail(accessToken: string): Promise<GuestOrder[]> {
  const res = await fetch(EDGE_FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ type: "email" }),
  });
  if (!res.ok) throw new Error(`Email lookup failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function OrderDetailView({ order }: { order: GuestOrder }) {
  return (
    <View style={styles.detailContainer}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailId}>Order #{order.id.slice(0, 8).toUpperCase()}</Text>
        <Text style={styles.detailDate}>{formatDate(order.created_at, "long")}</Text>
        <Text style={styles.detailStatus}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</Text>
      </View>

      {order.order_bags.map((bag) => (
        <View key={bag.id} style={styles.bagCard}>
          <View style={styles.bagHeader}>
            <Text style={styles.merchantName}>{bag.merchant_name || "Merchant"}</Text>
            <Text style={styles.bagStatus}>{BAG_STATUS_LABELS[bag.status] ?? bag.status}</Text>
          </View>

          {bag.order_items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemDetails}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.quantity > 1 && <Text style={styles.itemQty}>Qty: {item.quantity}</Text>}
              </View>
              <Text style={styles.itemPrice}>{formatPrice(item.line_price, order.currency)}</Text>
            </View>
          ))}

          {bag.status === "SHIPPED" && bag.tracking_number && (
            <Text style={styles.trackingInfo}>
              {bag.carrier ? `${bag.carrier} — ` : ""}#{bag.tracking_number}
            </Text>
          )}

          {/* Refund notice — optional chaining because older data from the Edge Function
              may not include order_refunds yet. Per Violet docs, CANCELED bags never
              have refund data; only REFUNDED/PARTIALLY_REFUNDED bags do.
              @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md */}
          {bag.order_refunds && bag.order_refunds.length > 0 && (
            <Text style={styles.refundNotice}>
              {`Refund of ${formatPrice(
                bag.order_refunds.reduce((s: number, r: { amount: number }) => s + r.amount, 0),
                order.currency,
              )} processed`}
              {bag.order_refunds[0]?.reason ? ` — ${bag.order_refunds[0].reason}` : ""}
            </Text>
          )}
        </View>
      ))}

      <View style={styles.pricingCard}>
        <Text style={styles.pricingTitle}>Order Summary</Text>
        <View style={styles.pricingRow}>
          <Text style={styles.pricingLabel}>Subtotal</Text>
          <Text style={styles.pricingValue}>{formatPrice(order.subtotal, order.currency)}</Text>
        </View>
        <View style={styles.pricingRow}>
          <Text style={styles.pricingLabel}>Shipping</Text>
          <Text style={styles.pricingValue}>
            {formatPrice(order.shipping_total, order.currency)}
          </Text>
        </View>
        <View style={styles.pricingRow}>
          <Text style={styles.pricingLabel}>Tax</Text>
          <Text style={styles.pricingValue}>{formatPrice(order.tax_total, order.currency)}</Text>
        </View>
        <View style={[styles.pricingRow, styles.pricingRowTotal]}>
          <Text style={styles.pricingTotalLabel}>Total</Text>
          <Text style={styles.pricingTotalValue}>{formatPrice(order.total, order.currency)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Page Component ────────────────────────────────────────────────────────────

export default function GuestLookupScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = params.token ?? "";

  const [currentStep, setCurrentStep] = useState<LookupStep>({ step: "email" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");

  // ── Token auto-lookup on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    setIsLoading(true);
    setError("");

    lookupByToken(token)
      .then((order) => {
        if (order) {
          setCurrentStep({ step: "token-result", order });
        } else {
          setError("Order not found. Your token may have expired or been mistyped.");
        }
      })
      .catch(() => {
        setError("Unable to look up order. Please try again.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token]);

  // ── Email step submit ───────────────────────────────────────────────────────
  async function handleEmailSubmit() {
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const supabase = createSupabaseClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });

      if (otpError) {
        const isRateLimit =
          (otpError as { status?: number }).status === 429 ||
          otpError.message.toLowerCase().includes("rate limit") ||
          otpError.message.toLowerCase().includes("too many");
        setError(
          isRateLimit
            ? "Too many requests. Please wait before trying again."
            : "Unable to send verification code. Please try again.",
        );
        return;
      }

      setCurrentStep({ step: "verify", email: email.trim() });
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ── OTP verify step submit ──────────────────────────────────────────────────
  async function handleOtpSubmit() {
    const verifyEmail = currentStep.step === "verify" ? currentStep.email : "";

    if (!otp || otp.length !== 6) {
      setError("Please enter the 6-digit code from your email.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const supabase = createSupabaseClient();

      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: verifyEmail,
        token: otp,
        type: "email",
      });

      if (verifyError) {
        setError("Invalid or expired code. Please try again.");
        return;
      }

      // Get session for Edge Function auth header
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Fetch orders, then always sign out (AC #3: clean up temporary OTP session)
      try {
        const orders = await lookupByEmail(session?.access_token ?? "");
        setCurrentStep({ step: "results", orders });
      } finally {
        await supabase.auth.signOut();
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
      setOtp("");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading && token && currentStep.step === "email") {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Track Your Order" }} />
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if (currentStep.step === "token-result") {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: "Track Your Order" }} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <OrderDetailView order={currentStep.order} />
      </ScrollView>
    );
  }

  if (currentStep.step === "results") {
    const { orders } = currentStep;

    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Your Orders" }} />
        {orders.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No orders found for this email. Check the address or contact support.
            </Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.content}
            renderItem={({ item: order }) => {
              const isExpanded = expandedOrderId === order.id;
              return (
                <View>
                  <Pressable
                    style={styles.orderCard}
                    onPress={() => setExpandedOrderId(isExpanded ? null : order.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isExpanded }}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.cardDate}>{formatDate(order.created_at, "short")}</Text>
                      <Text style={styles.cardStatus}>
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </Text>
                    </View>
                    <Text style={styles.cardId}>Order #{order.id.slice(0, 8).toUpperCase()}</Text>
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardMerchants}>
                        {order.order_bags.length === 1
                          ? "1 merchant"
                          : `${order.order_bags.length} merchants`}
                      </Text>
                      <Text style={styles.cardTotal}>
                        {formatPrice(order.total, order.currency)}
                      </Text>
                    </View>
                  </Pressable>
                  {isExpanded && <OrderDetailView order={order} />}
                </View>
              );
            }}
          />
        )}
      </View>
    );
  }

  if (currentStep.step === "verify") {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Stack.Screen options={{ title: "Verify Email" }} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Check Your Email</Text>
          <Text style={styles.subheading}>
            We sent a 6-digit code to <Text style={styles.emailHighlight}>{currentStep.email}</Text>
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            value={otp}
            onChangeText={(v) => setOtp(v.replace(/\D/g, ""))}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textContentType="oneTimeCode"
          />

          <Pressable
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleOtpSubmit}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? "Verifying…" : "Verify & View Orders"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setCurrentStep({ step: "email" });
              setError("");
              setOtp("");
            }}
          >
            <Text style={styles.backLink}>← Use a different email</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Email step (default)
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: "Track Your Order" }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Track Your Order</Text>
        <Text style={styles.subheading}>
          Enter your email to receive a verification code and view your orders.
        </Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoFocus
        />

        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleEmailSubmit}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? "Sending code…" : "Send Verification Code"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ivory,
  },
  content: {
    padding: spacing.px[4],
    paddingTop: spacing.px[8],
    paddingBottom: spacing.px[16],
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ivory,
  },
  heading: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: typography.typeScale.h1.size,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RN fontWeight type mismatch with numeric literal
    fontWeight: typography.typeScale.h1.weight as any,
    color: colors.ink,
    marginBottom: spacing.px[2],
  },
  subheading: {
    fontSize: typography.typeScale.body.size,
    color: colors.steel,
    marginBottom: spacing.px[6],
    lineHeight: 22,
  },
  emailHighlight: {
    fontWeight: "600",
    color: colors.charcoal,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.typeScale.bodySmall.size,
    backgroundColor: "rgba(192, 57, 43, 0.08)",
    padding: spacing.px[3],
    borderRadius: 6,
    marginBottom: spacing.px[4],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.stone,
    borderRadius: 8,
    padding: spacing.px[3],
    fontSize: typography.typeScale.body.size,
    color: colors.ink,
    backgroundColor: colors.ivory,
    marginBottom: spacing.px[4],
  },
  button: {
    backgroundColor: colors.gold,
    borderRadius: 8,
    padding: spacing.px[4],
    alignItems: "center",
    marginBottom: spacing.px[3],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.ivory,
    fontSize: typography.typeScale.body.size,
    fontWeight: "600",
  },
  backLink: {
    color: colors.steel,
    fontSize: typography.typeScale.bodySmall.size,
    textAlign: "center",
    marginTop: spacing.px[2],
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.px[8],
  },
  emptyText: {
    fontSize: typography.typeScale.body.size,
    color: colors.steel,
    textAlign: "center",
    lineHeight: 22,
  },
  // ── Order card ──────────────────────────────────────────────────────────────
  orderCard: {
    backgroundColor: colors.linen,
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: 12,
    padding: spacing.px[5],
    marginBottom: spacing.px[3],
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.px[2],
  },
  cardDate: {
    fontSize: typography.typeScale.caption.size,
    color: colors.steel,
  },
  cardStatus: {
    fontSize: typography.typeScale.caption.size,
    fontWeight: "600",
    color: colors.charcoal,
  },
  cardId: {
    fontSize: typography.typeScale.bodySmall.size,
    fontWeight: "600",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
    marginBottom: spacing.px[2],
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardMerchants: {
    fontSize: typography.typeScale.caption.size,
    color: colors.steel,
  },
  cardTotal: {
    fontSize: typography.typeScale.body.size,
    fontWeight: "700",
    color: colors.ink,
  },
  // ── Order detail ─────────────────────────────────────────────────────────────
  detailContainer: {
    marginTop: spacing.px[3],
    marginBottom: spacing.px[6],
  },
  detailHeader: {
    paddingBottom: spacing.px[4],
    marginBottom: spacing.px[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  detailId: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 20,
    fontWeight: "600",
    color: colors.ink,
    marginBottom: spacing.px[1],
  },
  detailDate: {
    fontSize: typography.typeScale.caption.size,
    color: colors.steel,
    marginBottom: spacing.px[1],
  },
  detailStatus: {
    fontSize: typography.typeScale.bodySmall.size,
    fontWeight: "600",
    color: colors.charcoal,
  },
  bagCard: {
    backgroundColor: colors.linen,
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: 10,
    padding: spacing.px[4],
    marginBottom: spacing.px[4],
  },
  bagHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.px[3],
    paddingBottom: spacing.px[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  merchantName: {
    fontSize: typography.typeScale.bodySmall.size,
    fontWeight: "600",
    color: colors.ink,
  },
  bagStatus: {
    fontSize: typography.typeScale.caption.size,
    fontWeight: "600",
    color: colors.steel,
    textTransform: "uppercase",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.px[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  itemDetails: {
    flex: 1,
    marginRight: spacing.px[3],
  },
  itemName: {
    fontSize: typography.typeScale.bodySmall.size,
    fontWeight: "500",
    color: colors.ink,
  },
  itemQty: {
    fontSize: typography.typeScale.caption.size,
    color: colors.steel,
  },
  itemPrice: {
    fontSize: typography.typeScale.bodySmall.size,
    fontWeight: "600",
    color: colors.ink,
  },
  trackingInfo: {
    fontSize: typography.typeScale.caption.size,
    color: colors.steel,
    marginTop: spacing.px[3],
    fontVariant: ["tabular-nums"],
  },
  refundNotice: {
    fontSize: typography.typeScale.caption.size,
    color: "#27ae60",
    marginTop: spacing.px[3],
    fontWeight: "500",
  },
  pricingCard: {
    backgroundColor: colors.linen,
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: 10,
    padding: spacing.px[4],
  },
  pricingTitle: {
    fontSize: typography.typeScale.caption.size,
    fontWeight: "600",
    color: colors.steel,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.px[3],
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.px[1],
  },
  pricingRowTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.sand,
    marginTop: spacing.px[2],
    paddingTop: spacing.px[3],
  },
  pricingLabel: {
    fontSize: typography.typeScale.bodySmall.size,
    color: colors.charcoal,
  },
  pricingValue: {
    fontSize: typography.typeScale.bodySmall.size,
    color: colors.charcoal,
  },
  pricingTotalLabel: {
    fontSize: typography.typeScale.body.size,
    fontWeight: "700",
    color: colors.ink,
  },
  pricingTotalValue: {
    fontSize: typography.typeScale.body.size,
    fontWeight: "700",
    color: colors.ink,
  },
});
