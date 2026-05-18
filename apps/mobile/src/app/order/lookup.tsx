/**
 * Guest Order Lookup Screen — `/order/lookup`
 *
 * Migrated from Supabase Auth OTP to Convex Auth OTP (Phase 6).
 *
 * ## Key changes from Supabase:
 * - Supabase signInWithOtp → Convex Auth signIn("password", { flow: "reset", email })
 * - Supabase verifyOtp → Convex Auth signIn("password", { flow: "reset", email, code })
 * - Supabase getSession → No Supabase session needed — token lookup is public
 * - Email-based lookup no longer requires a JWT (uses web backend with rate limiting instead)
 *
 * ## Two entry paths (data flow)
 * 1. **Token-based**: URL param `?token=<value>` → auto-lookup, no auth required
 * 2. **Email-based**: Guest enters email → Convex Auth OTP sent via Resend →
 *    user enters 6-digit code → web backend called for order lookup
 *
 * ## State machine (LookupStep)
 * ```
 * "email" -> (submit email) -> "verify" -> (submit OTP) -> "results"
 * "email" -> (token param present) -> "token-result"
 * ```
 */

import React, { useState, useEffect } from "react";
import {
  ScrollView,
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  formatPrice,
  formatDate,
  ORDER_STATUS_LABELS,
  BAG_STATUS_LABELS,
  type OrderWithBagsAndItems,
} from "@ecommerce/shared";
import { colors, spacing, typography } from "@ecommerce/ui";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { apiPost } from "@/server/apiClient";

// ─── Types ─────────────────────────────────────────────────────────────────────

type LookupStep =
  | { step: "email" }
  | { step: "verify"; email: string }
  | { step: "results"; orders: OrderWithBagsAndItems[] }
  | { step: "token-result"; order: OrderWithBagsAndItems };

// ─── API client ────────────────────────────────────────────────────────────

async function lookupByToken(token: string): Promise<OrderWithBagsAndItems | null> {
  const json = await apiPost<{ data?: OrderWithBagsAndItems }>("/api/guest-order-lookup", {
    type: "token",
    token,
  });
  return json.data ?? null;
}

async function lookupByEmail(email: string): Promise<OrderWithBagsAndItems[]> {
  const json = await apiPost<{ data?: OrderWithBagsAndItems[] }>("/api/guest-order-lookup", {
    type: "email",
    email,
  });
  return json.data ?? [];
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function OrderDetailView({ order }: { order: OrderWithBagsAndItems }) {
  return (
    <View style={styles.detailContainer}>
      <View style={styles.detailHeader}>
        <ThemedText style={styles.detailId} accessibilityRole="header">
          Order #{order.id.slice(0, 8).toUpperCase()}
        </ThemedText>
        <ThemedText style={styles.detailDate}>{formatDate(order.created_at, "long")}</ThemedText>
        <ThemedText style={styles.detailStatus}>
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </ThemedText>
      </View>

      {order.order_bags.map((bag) => (
        <ThemedView key={bag.id} style={styles.bagCard}>
          <View style={styles.bagHeader}>
            <ThemedText style={styles.merchantName}>{bag.merchant_name || "Merchant"}</ThemedText>
            <ThemedText style={styles.bagStatus}>
              {BAG_STATUS_LABELS[bag.status] ?? bag.status}
            </ThemedText>
          </View>

          {bag.order_items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemDetails}>
                <ThemedText style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </ThemedText>
                {item.quantity > 1 && (
                  <ThemedText style={styles.itemQty}>Qty: {item.quantity}</ThemedText>
                )}
              </View>
              <ThemedText style={styles.itemPrice}>
                {formatPrice(item.line_price, order.currency)}
              </ThemedText>
            </View>
          ))}

          {bag.status === "SHIPPED" && bag.tracking_number && (
            <ThemedText style={styles.trackingInfo}>
              {bag.carrier ? `${bag.carrier} — ` : ""}#{bag.tracking_number}
            </ThemedText>
          )}

          {bag.order_refunds.length > 0 && (
            <ThemedText style={styles.refundNotice}>
              {`Refund of ${formatPrice(
                bag.order_refunds.reduce((s: number, r: { amount: number }) => s + r.amount, 0),
                order.currency,
              )} processed`}
              {bag.order_refunds[0]?.reason ? ` — ${bag.order_refunds[0].reason}` : ""}
            </ThemedText>
          )}
        </ThemedView>
      ))}

      <ThemedView style={styles.pricingCard}>
        <ThemedText style={styles.pricingTitle} accessibilityRole="header">
          Order Summary
        </ThemedText>
        <View style={styles.pricingRow}>
          <ThemedText style={styles.pricingLabel}>Subtotal</ThemedText>
          <ThemedText style={styles.pricingValue}>
            {formatPrice(order.subtotal, order.currency)}
          </ThemedText>
        </View>
        <View style={styles.pricingRow}>
          <ThemedText style={styles.pricingLabel}>Shipping</ThemedText>
          <ThemedText style={styles.pricingValue}>
            {formatPrice(order.shipping_total, order.currency)}
          </ThemedText>
        </View>
        <View style={styles.pricingRow}>
          <ThemedText style={styles.pricingLabel}>Tax</ThemedText>
          <ThemedText style={styles.pricingValue}>
            {formatPrice(order.tax_total, order.currency)}
          </ThemedText>
        </View>
        <View style={[styles.pricingRow, styles.pricingRowTotal]}>
          <ThemedText style={styles.pricingTotalLabel}>Total</ThemedText>
          <ThemedText style={styles.pricingTotalValue}>
            {formatPrice(order.total, order.currency)}
          </ThemedText>
        </View>
      </ThemedView>
    </View>
  );
}

// ─── Page Component ────────────────────────────────────────────────────────────

export default function GuestLookupScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = params.token ?? "";
  const { signIn } = useAuthActions();

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

  // ── Email step submit — send OTP via Convex Auth (Resend) ──────────────────
  async function handleEmailSubmit() {
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Use Convex Auth reset flow to send an OTP to the guest's email.
      // This uses Resend (configured in Convex backend).
      // The OTP email is sent regardless of whether the user has an account.
      await signIn("password", {
        email: email.trim(),
        flow: "reset",
      });

      setCurrentStep({ step: "verify", email: email.trim() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("too many");
      setError(
        isRateLimit
          ? "Too many requests. Please wait before trying again."
          : "Unable to send verification code. Please try again.",
      );
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
      // Verify the OTP via Convex Auth
      // Note: For guest order lookup, we don't actually need to complete the auth flow.
      // We just need to verify that the user owns the email. The OTP verification
      // proves email ownership. We then use the email to look up orders.
      await signIn("password", {
        email: verifyEmail,
        flow: "reset",
        code: otp,
      });

      // Fetch orders by email — no JWT needed, the OTP already proved email ownership
      const orders = await lookupByEmail(verifyEmail);
      setCurrentStep({ step: "results", orders });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("expired")
          ? "Invalid or expired code. Please try again."
          : "An unexpected error occurred. Please try again.",
      );
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
        {error ? (
          <View accessibilityLiveRegion="polite">
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}
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
            <ThemedText style={styles.emptyText}>
              No orders found for this email. Check the address or contact support.
            </ThemedText>
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
                      <ThemedText style={styles.cardDate}>
                        {formatDate(order.created_at, "short")}
                      </ThemedText>
                      <ThemedText style={styles.cardStatus}>
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.cardId}>
                      Order #{order.id.slice(0, 8).toUpperCase()}
                    </ThemedText>
                    <View style={styles.cardFooter}>
                      <ThemedText style={styles.cardMerchants}>
                        {order.order_bags.length === 1
                          ? "1 merchant"
                          : `${order.order_bags.length} merchants`}
                      </ThemedText>
                      <ThemedText style={styles.cardTotal}>
                        {formatPrice(order.total, order.currency)}
                      </ThemedText>
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
          <ThemedText style={styles.heading}>Check Your Email</ThemedText>
          <ThemedText style={styles.subheading}>
            We sent a 6-digit code to{" "}
            <ThemedText style={styles.emailHighlight}>{currentStep.email}</ThemedText>
          </ThemedText>

          {error ? (
            <View accessibilityLiveRegion="polite">
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            value={otp}
            onChangeText={(v) => setOtp(v.replace(/\D/g, ""))}
            placeholder="000000"
            placeholderTextColor={colors.steel}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textContentType="oneTimeCode"
            accessibilityLabel="Verification code"
          />

          <Pressable
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleOtpSubmit}
            disabled={isLoading}
          >
            <ThemedText style={styles.buttonText}>
              {isLoading ? "Verifying\u2026" : "Verify & View Orders"}
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => {
              setCurrentStep({ step: "email" });
              setError("");
              setOtp("");
            }}
            accessibilityRole="link"
          >
            <ThemedText style={styles.backLink}>{"\u2190"} Use a different email</ThemedText>
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
        <ThemedText style={styles.heading}>Track Your Order</ThemedText>
        <ThemedText style={styles.subheading}>
          Enter your email to receive a verification code and view your orders.
        </ThemedText>

        {error ? (
          <View accessibilityLiveRegion="polite">
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          placeholderTextColor={colors.steel}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          autoFocus
          accessibilityLabel="Email address"
        />

        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleEmailSubmit}
          disabled={isLoading}
        >
          <ThemedText style={styles.buttonText}>
            {isLoading ? "Sending code\u2026" : "Send Verification Code"}
          </ThemedText>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RN fontWeight type mismatch
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
