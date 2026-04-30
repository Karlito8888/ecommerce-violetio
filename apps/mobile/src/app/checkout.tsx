/**
 * Checkout screen — full checkout flow: address → methods → guest info → payment.
 *
 * ## Architecture (Phase 4 refactor)
 * This component is a thin orchestrator (~100 lines) that:
 * 1. Holds the checkout state via `useReducer` (21 useState → single state object)
 * 2. Binds per-step hooks to the reducer dispatch
 * 3. Renders step components from `checkoutSteps.tsx`
 *
 * All business logic lives in:
 * - `checkoutReducer.ts` — pure state machine with typed actions
 * - `checkoutHooks.ts` — per-step mutation hooks (validation → API → dispatch)
 * - `checkoutSteps.tsx` — per-step UI components (pure presentation)
 * - `getCheckout.ts` — typed API fetch functions
 *
 * ## Stripe PaymentSheet
 * Mobile uses `@stripe/stripe-react-native` PaymentSheet — a native UI that
 * handles card input, Apple Pay, and Google Pay. Per Violet docs:
 * 1. Cart created with `wallet_based_checkout: true` → returns payment intent
 * 2. PaymentSheet initialized with client secret from Violet
 * 3. User confirms payment → card authorized (not charged yet)
 * 4. Cart submitted to Violet → card charged, order created
 *
 * @see apps/mobile/src/checkout/ — refactored modules
 * @see apps/web/src/routes/api/cart/ — API Routes
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart
 * @see https://docs.violet.io/prism/checkout-guides/guides/violet-checkout-with-stripejs-v3
 */

import React, { useReducer, useRef } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useStripe } from "@stripe/stripe-react-native";
import * as SecureStore from "expo-secure-store";

import { Spacing } from "@/constants/theme";
import { CART_STORAGE_KEY } from "@/constants/cart";
import { useSetStripeKey } from "./_layout";
import {
  checkoutReducer,
  initialCheckoutState,
  useAddressStep,
  useShippingStep,
  useGuestInfoStep,
  useBillingStep,
  usePaymentStep,
  useDiscountStep,
  AddressStep,
  ShippingStep,
  GuestInfoStep,
  BillingStep,
  PaymentStep,
  DiscountStep,
  CheckoutHeader,
} from "@/checkout";
import { fetchCartMobile } from "@/server/getCart";

export default function CheckoutScreen() {
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckoutState);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { setStripePublishableKey } = useSetStripeKey();

  /** Stable order ID for idempotency — generated once per checkout session. */
  const appOrderIdRef = useRef(crypto.randomUUID());

  // Fetch cart data for discount display (available after address step)
  const [cartData, setCartData] = React.useState<{
    bags: import("@ecommerce/shared").Bag[];
    discounts: import("@ecommerce/shared").DiscountItem[];
    discountTotal: number;
  }>({
    bags: [],
    discounts: [],
    discountTotal: 0,
  });
  React.useEffect(() => {
    async function loadCart() {
      try {
        const id = await SecureStore.getItemAsync(CART_STORAGE_KEY);
        if (!id) return;
        const result = await fetchCartMobile(id);
        if (result.data) {
          const bags = result.data.bags;
          const allDiscounts = bags.flatMap((b) => b.discounts ?? []);
          const totalDiscount = bags.reduce((sum, b) => sum + (b.discountTotal ?? 0), 0);
          setCartData({ bags, discounts: allDiscounts, discountTotal: totalDiscount });
        }
      } catch {
        // Cart may not exist yet — ignore
      }
    }
    loadCart();
  }, [state.step, state.discount.isApplying]);

  // ── Per-step hooks ──────────────────────────────────────────────────
  const addressStep = useAddressStep(state, dispatch);
  const shippingStep = useShippingStep(state, dispatch);
  const guestInfoStep = useGuestInfoStep(state, dispatch);
  const billingStep = useBillingStep(state, dispatch, initPaymentSheet, setStripePublishableKey);
  const paymentStep = usePaymentStep(
    state,
    dispatch,
    presentPaymentSheet,
    appOrderIdRef.current,
    (orderId: string) => router.push(`/order/${orderId}/confirmation` as never),
  );
  const discountStep = useDiscountStep(state, dispatch, cartData.bags);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <CheckoutHeader />

        <AddressStep
          state={state}
          onUpdate={addressStep.updateAddress}
          onSubmit={addressStep.submit}
        />

        <ShippingStep
          state={state}
          onSelectMethod={shippingStep.selectMethod}
          onRetry={shippingStep.retryFetch}
          onSubmit={shippingStep.submit}
          allBagsSelected={shippingStep.allBagsSelected}
        />

        <GuestInfoStep
          state={state}
          onUpdate={guestInfoStep.update}
          onSubmit={guestInfoStep.submit}
        />

        <BillingStep
          state={state}
          onToggleSameAsShipping={billingStep.toggleSameAsShipping}
          onUpdateAddress={billingStep.updateAddress}
          onSubmit={billingStep.submit}
        />

        <PaymentStep state={state} onSubmit={paymentStep.submit} />

        <DiscountStep
          discounts={cartData.discounts}
          discountTotal={cartData.discountTotal}
          promoCode={state.discount.promoCode}
          isApplying={state.discount.isApplying}
          error={state.discount.error}
          onUpdatePromoCode={discountStep.updatePromoCode}
          onApplyPromo={discountStep.applyPromo}
          onRemoveDiscount={discountStep.removeDiscountCode}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: Spacing.three, paddingBottom: Spacing.five },
});
