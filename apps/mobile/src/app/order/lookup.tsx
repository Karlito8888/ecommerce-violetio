/**
 * Guest Order Lookup Screen — `/order/lookup`
 *
 * Route: `/order/lookup`
 *
 * ## Purpose
 * React Native implementation of the guest order lookup feature (AC: #1, #2, #3, #6, #7).
 * Allows guest users (who checked out without creating an account) to find and view
 * their order details. Mirrors the web route `/order/lookup` but uses React Native
 * components and calls the `guest-order-lookup` Supabase Edge Function directly
 * (mobile cannot call TanStack Start Server Functions).
 *
 * ## Navigation flow
 * - **Entry point 1**: Profile/Settings screen -> "Track an Order" link
 *   (`router.push("/order/lookup")` in `profile.tsx`)
 * - **Entry point 2**: Deep link with token: `myapp://order/lookup?token=abc123`
 *   (e.g., from the tracking link shown on the confirmation screen)
 * - **Exit**: Back button in the Stack header navigates back to the previous screen
 * - **No forward navigation**: Orders are displayed inline (expanded/collapsed),
 *   not as links to a separate detail screen
 *
 * ## Two entry paths (data flow)
 * 1. **Token-based**: URL param `?token=<value>` triggers auto-lookup on mount.
 *    Calls the Edge Function with `{ type: "token", token }` — no auth required.
 *    Displays a single order detail view directly.
 * 2. **Email-based**: Guest enters email -> Supabase OTP sent -> user enters 6-digit
 *    code -> OTP verified -> Edge Function called with `{ type: "email" }` + Bearer token
 *    -> displays list of all orders for that email.
 *
 * ## State machine (LookupStep)
 * ```
 * "email" -> (submit email) -> "verify" -> (submit OTP) -> "results"
 *                                                          -> orders[] displayed in FlatList
 * "email" -> (token param present) -> "token-result"
 *                                      -> single order displayed
 * ```
 *
 * ## Data dependencies
 * - `EXPO_PUBLIC_SUPABASE_URL` environment variable for Edge Function URL
 * - `guest-order-lookup` Supabase Edge Function (handles both token and email lookups)
 * - Supabase Auth OTP flow for email verification
 * - Shared utilities: `formatPrice()`, `formatDate()`, `ORDER_STATUS_LABELS`,
 *   `BAG_STATUS_LABELS` from `@ecommerce/shared`
 * - Design tokens: `colors`, `spacing`, `typography` from `@ecommerce/ui`
 *
 * ## Relationship with shared hooks
 * This screen does NOT use the shared `useOrders` hook or TanStack Query because:
 * 1. Guest lookups are transient — no persistent cache needed
 * 2. The data comes from the `guest-order-lookup` Edge Function with a different
 *    shape (snake_case from Supabase) than the Violet-proxied `OrderDetail` type
 * 3. The OTP auth flow is unique to guest lookup and doesn't fit the query pattern
 *
 * The local `GuestOrder` / `OrderBag` / `OrderItem` types mirror the Supabase table
 * structure (snake_case) rather than the Violet API shape (camelCase). If a shared
 * type is added later, these should be consolidated.
 *
 * ## Session cleanup
 * After OTP verification and fetching orders, we immediately sign out
 * (`supabase.auth.signOut()`) to prevent leaving a stale Supabase session the
 * guest doesn't know about. This is wrapped in a `finally` block to ensure
 * cleanup even if the order fetch fails.
 *
 * ## Error handling
 * - Empty email: Validated client-side before submission
 * - OTP errors: Invalid/expired code message displayed inline
 * - Rate limiting: Detected via status 429 or message content, shown as user-friendly text
 * - Network errors: Generic "unexpected error" message via catch blocks
 * - Token lookup failure: Shows "order not found" with expiration hint
 * - **Gap**: No retry mechanism for failed lookups — user must re-enter data
 * - **Gap**: No offline detection — errors are generic, not offline-specific
 *
 * ## Accessibility (updated)
 * - Order cards in the results list have `accessibilityRole="button"` and
 *   `accessibilityState={{ expanded }}` for proper VoiceOver announcement
 * - `textContentType="oneTimeCode"` on OTP input enables iOS autofill from SMS
 * - `textContentType="emailAddress"` and `autoComplete="email"` for email input
 * - `keyboardShouldPersistTaps="handled"` prevents keyboard dismissal on button press
 * - `accessibilityLabel` on all `TextInput` fields (email and OTP) so screen readers
 *   do not rely solely on placeholder text
 * - `accessibilityLiveRegion="polite"` on error message containers so screen readers
 *   announce errors dynamically when they appear
 * - `accessibilityRole="link"` on the "Use a different email" back button
 * - `OrderDetailView` has `accessibilityRole="header"` on the "Order Summary" pricing
 *   title and the order ID heading for VoiceOver heading navigation
 *
 * ## Styling (updated)
 * Now uses `ThemedText` and `ThemedView` from `@/components/` for dark mode support,
 * matching the confirmation screen's approach. Design tokens are still imported from
 * `@ecommerce/ui` (`colors`, `spacing`, `typography`) because this screen was authored
 * with those tokens and they provide richer typographic control than `@/constants/theme`.
 * Both import paths are valid — `@/constants/theme` is the simpler convention used by
 * the confirmation screen, while `@ecommerce/ui` offers the full design system. The
 * key fix is replacing raw `Text`/`View` with themed variants for dark mode.
 *
 * ## Platform-specific behaviors
 * - `KeyboardAvoidingView` with `behavior="padding"` on iOS only (Android handles
 *   keyboard avoidance differently via `windowSoftInputMode`)
 * - Font family: Georgia on iOS, generic serif on Android (for heading text)
 * - `FlatList` used for order results (virtualized, performant for long lists)
 *
 * ## Deep linking
 * Supports `order/lookup?token=<value>` — the `useLocalSearchParams` hook extracts
 * the `token` query param. When present, the screen skips the email step and
 * immediately performs a token-based lookup.
 *
 * ## Differences from web counterpart
 * - Web uses TanStack Start Server Functions; mobile uses Edge Function directly
 * - Web uses CSS + BEM styling; mobile uses StyleSheet with design tokens
 * - Both share the same Edge Function backend and OTP verification flow
 * - Mobile includes refund display (from Story 5.5) inline within bag cards
 *
 * @see {@link file://apps/web/src/routes/order/lookup.tsx} — web equivalent
 * @see {@link file://supabase/functions/guest-order-lookup/index.ts} — Edge Function
 * @see {@link file://packages/shared/src/hooks/useOrders.ts} — shared query options (unused here)
 * @see {@link file://apps/mobile/src/app/profile.tsx} — navigation entry point
 * @see Story 5.4 — Guest Order Lookup
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
import {
  createSupabaseClient,
  formatPrice,
  formatDate,
  ORDER_STATUS_LABELS,
  BAG_STATUS_LABELS,
} from "@ecommerce/shared";
import { colors, spacing, typography } from "@ecommerce/ui";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Line item within an order bag, as returned by the Supabase `guest-order-lookup`
 * Edge Function. Uses snake_case to match Supabase table columns directly.
 */
interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  line_price: number;
  thumbnail: string | null;
}

/** Refund record associated with an order bag. Added in Story 5.5. */
interface OrderRefund {
  id: string;
  amount: number;
  reason: string | null;
  currency: string;
}

/**
 * Merchant bag with nested items and optional refunds. Maps to the `order_bags`
 * Supabase table with joined `order_items` and `order_refunds`.
 */
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

/**
 * Top-level guest order with nested bags. Returned by the `guest-order-lookup`
 * Edge Function for both token-based and email-based lookups.
 */
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

/**
 * Discriminated union representing the current step in the lookup wizard.
 * Drives which UI is rendered — each step has its own render branch.
 */
type LookupStep =
  | { step: "email" }
  | { step: "verify"; email: string }
  | { step: "results"; orders: GuestOrder[] }
  | { step: "token-result"; order: GuestOrder };

// ─── Edge Function client ──────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/guest-order-lookup`;

/**
 * Looks up a single order by its guest tracking token.
 * No authentication required — the token itself is the secret.
 *
 * @param token - The guest tracking token from the confirmation screen
 * @returns The order if found, or `null` if the token is invalid/expired
 * @throws Error if the HTTP request fails (non-2xx status)
 */
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

/**
 * Looks up all orders associated with the authenticated email.
 * Requires a valid Supabase JWT obtained after OTP verification.
 * The Edge Function uses the JWT's email claim to query orders.
 *
 * @param accessToken - Supabase session JWT from OTP verification
 * @returns Array of orders (empty if none found for the email)
 * @throws Error if the HTTP request fails (non-2xx status)
 */
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

/**
 * Renders the full detail view for a single guest order.
 *
 * Displays order header (ID, date, status), per-merchant bag cards with line items,
 * shipping tracking info (when shipped), refund notices (Story 5.5), and a pricing
 * summary card.
 *
 * Used in two contexts:
 * 1. **Token lookup result**: Rendered directly as the sole content
 * 2. **Email lookup results**: Rendered inline below an expanded order card in the FlatList
 *
 * ## Accessibility
 * - Order ID text has `accessibilityRole="header"` for VoiceOver heading navigation
 * - "Order Summary" pricing title has `accessibilityRole="header"`
 * - Refund notices use semantic text for screen reader clarity
 *
 * ## Styling
 * Uses `ThemedText` and `ThemedView` for dark mode support. Colors from `@ecommerce/ui`
 * are applied via StyleSheet for fine-grained control over typography and layout.
 *
 * @param props.order - The guest order data from the Edge Function
 */
function OrderDetailView({ order }: { order: GuestOrder }) {
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

          {/* Refund notice — optional chaining because older data from the Edge Function
              may not include order_refunds yet. Per Violet docs, CANCELED bags never
              have refund data; only REFUNDED/PARTIALLY_REFUNDED bags do.
              @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states.md */}
          {bag.order_refunds && bag.order_refunds.length > 0 && (
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

/**
 * Main screen component for guest order lookup.
 *
 * Implements a multi-step wizard using the `LookupStep` discriminated union.
 * Each step renders a different UI branch. The component manages all state
 * locally (no external state management) since the lookup flow is transient.
 *
 * ## Accessibility
 * - All `TextInput` fields have explicit `accessibilityLabel` props
 * - Error messages use `accessibilityLiveRegion="polite"` for dynamic announcements
 * - "Use a different email" back link has `accessibilityRole="link"`
 * - Order cards have `accessibilityRole="button"` with `accessibilityState={{ expanded }}`
 *
 * @see LookupStep for the state machine definition
 */
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
