import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useCartContext } from "../../contexts/CartContext";
import {
  useCartQuery,
  queryKeys,
  formatPrice,
  buildPageMeta,
  getDiscountDisplay,
} from "@ecommerce/shared";
import type {
  CartFetchFn,
  ShippingMethodsAvailable,
  ShippingAddressInput,
  CustomerInput,
  CheckoutError,
} from "@ecommerce/shared";
import { getCartFn, updateCartItemFn, removeFromCartFn } from "../../server/cartActions";
import {
  setShippingAddressFn,
  getAvailableShippingMethodsFn,
  setShippingMethodsFn,
  priceCartFn,
  setCustomerFn,
  setBillingAddressFn,
  addDiscountFn,
  removeDiscountFn,
  getPaymentIntentFn,
  submitOrderFn,
  clearCartCookieFn,
  persistAndConfirmOrderFn,
  logClientErrorFn,
} from "../../server/checkout";
import { useAuthSession } from "../../hooks/useAuthSession";
import {
  COUNTRIES_WITHOUT_POSTAL_CODE,
  getSupportedCountries,
  COUNTRY_LABELS,
} from "@ecommerce/shared";
import { CheckoutErrorBoundary } from "../../components/checkout/CheckoutErrorBoundary";
import { BagErrors } from "../../components/checkout/BagErrors";
import { InventoryAlert } from "../../components/checkout/InventoryAlert";
import { CartRecovery } from "../../components/checkout/CartRecovery";
import { RetryPrompt } from "../../components/checkout/RetryPrompt";

/**
 * /checkout — Full checkout flow: address → methods → guest info → billing → payment.
 *
 * ## Why no loader (CSR-only)
 * Stripe Elements requires client-side rendering. `loadStripe()` and `<Elements>`
 * cannot run server-side. Keeping checkout CSR also avoids server-side cart state
 * management complexity.
 *
 * ## Checkout step machine
 * address → methods → confirmed → guestInfo → billing → payment → complete
 *
 * - Steps address/methods/confirmed are Story 4.3 (shipping)
 * - Steps guestInfo/billing/payment are Story 4.4 (customer + payment)
 *
 * @see apps/web/src/server/checkout.ts — Server Functions
 * @see apps/web/src/styles/pages/checkout.css — BEM styles
 */
function CheckoutPageWithBoundary() {
  const navigate = useNavigate();
  return (
    <CheckoutErrorBoundary onNavigateToCart={() => navigate({ to: "/cart" })}>
      <CheckoutPage />
    </CheckoutErrorBoundary>
  );
}

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const Route = createFileRoute("/checkout/")({
  component: CheckoutPageWithBoundary,
  head: () => ({
    meta: buildPageMeta({
      title: "Checkout | Maison Émile",
      description: "Complete your purchase securely.",
      url: "/checkout",
      siteUrl: SITE_URL,
      noindex: true,
    }),
  }),
});

const fetchCart: CartFetchFn = (violetCartId) => getCartFn({ data: violetCartId });

/**
 * Cache for Stripe instances by publishable key.
 *
 * Violet creates payment intents on their own Stripe platform account (Demo/Test Mode),
 * so the correct publishable key comes from the PI response (`stripe_key` field), not
 * from our `VITE_STRIPE_PUBLISHABLE_KEY` env var. A mismatch causes PaymentElement loaderror.
 *
 * This cache ensures `loadStripe()` is called at most once per key (Stripe's recommendation),
 * while allowing the key to be determined at runtime from Violet's response.
 *
 * @see https://stripe.com/docs/stripe-js/react#elements-provider
 */
const stripeInstanceCache = new Map<string, ReturnType<typeof loadStripe>>();
function getStripePromise(publishableKey: string): ReturnType<typeof loadStripe> {
  if (!stripeInstanceCache.has(publishableKey)) {
    stripeInstanceCache.set(publishableKey, loadStripe(publishableKey));
  }
  return stripeInstanceCache.get(publishableKey)!;
}

/**
 * Countries supported for shipping address selection.
 *
 * Dynamically determined based on the Stripe Platform account country:
 * - US platform (sandbox): US + UK + EEA — matches Violet demo merchants (US Shopify)
 * - EU/EEA platform (production): UK + EEA only — we can only work with EEA merchants
 *
 * @see packages/shared/src/utils/eeaCountries.ts — source of truth
 * @see https://docs.violet.io/prism/payments/payment-settings/supported-countries
 */
const STRIPE_PLATFORM_COUNTRY = import.meta.env.VITE_STRIPE_ACCOUNT_COUNTRY || "US";
const SUPPORTED_COUNTRIES = getSupportedCountries(STRIPE_PLATFORM_COUNTRY);
const COUNTRY_LABELS_MAP = COUNTRY_LABELS;

/**
 * Checkout step state machine.
 *
 * Story 4.3: address → methods → confirmed
 * Story 4.4: confirmed → guestInfo → billing → payment → complete
 */
type CheckoutStep = "address" | "methods" | "confirmed" | "guestInfo" | "billing" | "payment";

interface AddressFormState {
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** Contact phone for carrier delivery notifications — optional per Violet docs. */
  phone: string;
}

interface AddressFormErrors {
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}

// ─── PaymentForm ──────────────────────────────────────────────────────────
// Extracted as a child component because `useStripe()` and `useElements()`
// hooks MUST be called inside an `<Elements>` provider. They throw if called
// in the same component that renders `<Elements>`.

/**
 * Inner payment form rendered inside `<Elements>` provider.
 *
 * ## Stripe hooks requirement
 * `useStripe()` and `useElements()` only work inside an `<Elements>` provider.
 * This is a Stripe architectural constraint — the hooks access the Stripe
 * instance from React context provided by `<Elements>`.
 *
 * ## Submit flow
 * 1. `stripe.confirmPayment({ redirect: "if_required" })` — authorizes card
 * 2. On success: call `submitOrderFn` — Violet charges the card
 * 3. If REQUIRES_ACTION: `stripe.handleNextAction()` for 3DS, then re-submit
 * 4. If COMPLETED: navigate to confirmation
 * 5. If REJECTED: show error
 *
 * @see Story 4.4 C3 — complete submit flow reference
 */
function PaymentForm({
  appOrderId,
  violetCartId,
  onSuccess,
  onPreSubmitValidation,
}: {
  appOrderId: string;
  /**
   * Violet cart ID — needed for lost confirmation polling (Story 4.7 AC#3).
   *
   * ## Why this prop exists (Code Review Fix — C2)
   * The original implementation passed `appOrderId` (a UUID v4 idempotency key) to
   * `getCartFn()` during polling, but `getCartFn` expects a Violet cart integer ID.
   * This caused the polling to always 404 — making lost confirmation recovery useless.
   *
   * `violetCartId` must be the Violet integer cart ID (as string), NOT the UUID.
   * PaymentForm cannot access CartContext directly because it renders inside
   * `<Elements>` (Stripe provider), so we pass it explicitly from the parent.
   */
  violetCartId: string;
  onSuccess: (orderId: string) => void;
  /** Story 4.7: Pre-submit inventory validation callback */
  onPreSubmitValidation?: () => Promise<boolean>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentLoadError, setPaymentLoadError] = useState<string | null>(null);

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    // Story 4.7: Pre-submit inventory validation (FR18)
    if (onPreSubmitValidation) {
      const isValid = await onPreSubmitValidation();
      if (!isValid) {
        setIsSubmitting(false);
        return;
      }
    }

    /**
     * Step 0: Trigger Stripe Elements form validation and collect wallet payment methods.
     *
     * Per Stripe docs, elements.submit() must be called before confirmPayment() to
     * trigger form validation and collect wallet payment methods (Apple Pay, Google Pay).
     * Skipping this step can cause validation errors to be missed.
     *
     * @see https://docs.stripe.com/js/payment_intents/confirm_payment
     */
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setSubmitError(submitError.message ?? "Please check your payment details and try again.");
      setIsSubmitting(false);
      logClientErrorFn({
        data: {
          error_type: "STRIPE.ELEMENTS_SUBMIT_FAILED",
          message: submitError.message ?? "Elements submit failed",
          context: { code: submitError.code },
        },
      });
      return;
    }

    /**
     * Step 1: Confirm payment client-side.
     *
     * `redirect: "if_required"` prevents Stripe from redirecting for standard
     * card payments. For Apple Pay / Google Pay, Stripe handles natively.
     * This call AUTHORIZES the card but does NOT charge it.
     *
     * @see https://docs.violet.io/guides/checkout/payments
     */
    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (stripeError) {
      setSubmitError(getStripeErrorMessage(stripeError));
      setIsSubmitting(false);
      logClientErrorFn({
        data: {
          error_type: "STRIPE.PAYMENT_FAILED",
          message: stripeError.message ?? "Payment confirmation failed",
          context: { code: stripeError.code, type: stripeError.type },
        },
      });
      return;
    }

    /**
     * Step 2: Submit to Violet — this charges the card.
     *
     * Uses the same `appOrderId` for idempotency. If the user clicks submit
     * twice, or retries after 3DS, Violet deduplicates via this ID.
     */
    const result = await submitOrderFn({ data: { appOrderId } });

    if (result.error) {
      /**
       * Story 4.7 AC#3: Lost confirmation polling.
       *
       * When submit returns a network/timeout error (not a Violet business error),
       * the order may have actually been placed. Before showing an error, we poll
       * the cart status to check if it transitioned to "completed".
       *
       * ## Why `violetCartId` and not `appOrderId` (Code Review Fix — C2)
       * `getCartFn` calls Violet's GET /checkout/cart/{id} which expects the
       * numeric Violet cart ID. `appOrderId` is a UUID v4 used only for
       * idempotency — passing it here would always 404.
       */
      if (
        result.error.code === "VIOLET.API_ERROR" ||
        result.error.message.toLowerCase().includes("timeout")
      ) {
        /**
         * Lost confirmation polling — check if the order completed despite the error.
         *
         * cartCheck.data.id is the Supabase UUID (cart row ID), NOT the Violet order ID.
         * The onSuccess handler expects a Violet order ID for the confirmation page
         * navigation. Since the cart response does not contain the Violet order ID,
         * we navigate the user to home with a success message instead of attempting
         * to build a confirmation URL with the wrong ID type.
         */
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const cartCheck = await getCartFn({ data: violetCartId });
          if (cartCheck.data?.status === "completed") {
            await clearCartCookieFn();
            setSubmitError(null);
            setIsSubmitting(false);
            onSuccess("");
            return;
          }
        }
        setSubmitError(
          "Your order may have been placed. Please check your email for confirmation before trying again.",
        );
        setIsSubmitting(false);
        return;
      }

      /**
       * 409 Conflict — duplicate submission with a different app_order_id.
       * This typically means the cart was already submitted. Don't retry — poll instead.
       */
      if (result.error.code === "VIOLET.CONFLICT") {
        setSubmitError(
          "This order may have already been placed. Please check your email before trying again.",
        );
        setIsSubmitting(false);
        return;
      }

      /**
       * 412 Precondition Failed — cart not priced or checkout incomplete.
       * This means our checkout flow missed a required step. User should start a new cart.
       */
      if (result.error.code === "VIOLET.PRECONDITION_FAILED") {
        setSubmitError(
          "Your cart could not be submitted because checkout was incomplete. Please start a new order.",
        );
        setIsSubmitting(false);
        return;
      }

      setSubmitError(result.error.message);
      setIsSubmitting(false);
      return;
    }

    /**
     * Step 3: Handle 3D Secure challenge if needed.
     *
     * When Violet returns REQUIRES_ACTION, the bank requires additional
     * authentication. `stripe.handleNextAction()` opens the 3DS challenge
     * modal. After resolution, re-submit with the same appOrderId.
     */
    if (result.data?.status === "REQUIRES_ACTION") {
      const secret = result.data.paymentIntentClientSecret;
      if (!secret) {
        setSubmitError("3D Secure required but no client secret returned");
        setIsSubmitting(false);
        return;
      }

      const { error: actionError } = await stripe.handleNextAction({
        clientSecret: secret,
      });

      if (actionError) {
        setSubmitError(actionError.message ?? "3D Secure authentication failed");
        setIsSubmitting(false);
        return;
      }

      // Re-submit after 3DS success (reuse same appOrderId for idempotency)
      const retryResult = await submitOrderFn({ data: { appOrderId } });
      if (
        retryResult.error ||
        retryResult.data?.status === "REJECTED" ||
        retryResult.data?.status === "CANCELED"
      ) {
        setSubmitError(
          retryResult.error?.message ??
            "Order could not be completed after verification. Your card was not charged.",
        );
        setIsSubmitting(false);
        return;
      }

      onSuccess(retryResult.data?.id ?? "");
      return;
    }

    if (result.data?.status === "REJECTED") {
      setSubmitError("Your order was rejected. Please try a different payment method.");
      setIsSubmitting(false);
      return;
    }

    /**
     * Handle CANCELED status — merchant canceled the order after initial acceptance.
     * This is distinct from REJECTED (payment failure). The user was NOT charged.
     *
     * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states
     */
    if (result.data?.status === "CANCELED") {
      setSubmitError(
        "Your order was canceled by the merchant. Your card was not charged. Please try again.",
      );
      setIsSubmitting(false);
      return;
    }

    /**
     * Success — COMPLETED status (full or partial).
     *
     * ## Partial success handling
     * Multi-bag carts may have some bags succeed and some fail. When this happens,
     * Violet returns `status: "COMPLETED"` with `errors[]` populated for failed bags.
     * Failed bags have `status: "REJECTED"` / `financialStatus: "VOIDED"`.
     * The card is only charged for successful bags — no overcharge risk.
     *
     * We navigate to the confirmation page regardless. The confirmation page fetches
     * `OrderDetail` from Violet which includes per-bag statuses (ACCEPTED vs REJECTED),
     * so the user sees exactly which items were fulfilled and which weren't.
     *
     * @see packages/shared/src/types/order.types.ts — OrderSubmitResult.errors
     * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-completion/submit-cart
     */
    onSuccess(result.data?.id ?? "");
  }

  /**
   * Maps Stripe error codes to human-readable messages.
   *
   * Stripe returns machine-readable `error.code` values. We map common payment
   * errors to clear, actionable messages for the user. The fallback uses
   * Stripe's own `error.message` which is already user-friendly for most cases.
   *
   * @see https://stripe.com/docs/error-codes
   */
  function getStripeErrorMessage(error: { code?: string; message?: string }): string {
    switch (error.code) {
      case "card_declined":
        return "Your card was declined. Please try a different payment method.";
      case "expired_card":
        return "Your card has expired. Please use a different card.";
      case "incorrect_cvc":
        return "The security code is incorrect. Please check and try again.";
      case "processing_error":
        return "A processing error occurred. Please try again in a moment.";
      case "insufficient_funds":
        return "Insufficient funds. Please try a different payment method.";
      default:
        return error.message ?? "Payment could not be processed. Please try again.";
    }
  }

  return (
    <form onSubmit={handlePlaceOrder}>
      <PaymentElement
        onLoadError={(event) => {
          setPaymentLoadError(
            event.error?.message ??
              "Payment form could not be loaded. Please refresh and try again.",
          );
        }}
      />

      {paymentLoadError && (
        <p className="checkout__field-error" role="alert" style={{ marginTop: "1rem" }}>
          {paymentLoadError}
        </p>
      )}

      {submitError && (
        <p className="checkout__field-error" role="alert" style={{ marginTop: "1rem" }}>
          {submitError}
        </p>
      )}

      <button
        type="submit"
        className={`checkout__submit checkout__submit--place-order${isSubmitting ? " checkout__submit--loading" : ""}`}
        disabled={isSubmitting || !stripe || !elements || !!paymentLoadError}
        style={{ marginTop: "1.5rem" }}
      >
        {isSubmitting ? (
          <span className="checkout__submit-spinner" aria-label="Processing payment…">
            Processing…
          </span>
        ) : (
          "Place Order"
        )}
      </button>
    </form>
  );
}

// ─── WalletCheckoutForm (Apple Pay / Google Pay Checkout) ────────────────
// Renders a PaymentRequestButtonElement that handles the full checkout flow
// through the Apple Pay / Google Pay sheet: address, shipping, payment.
//
// ## Flow (per Violet docs)
// 1. User taps Apple Pay / Google Pay button
// 2. `shippingaddresschange`: apply customer address to cart, fetch shipping methods
// 3. `shippingoptionchange`: apply selected shipping method to cart
// 4. `paymentmethod`: confirm payment via Stripe, then submit to Violet
//    with `order_customer` containing the full (unredacted) address
//
// ## Multi-merchant limitation
// Apple Pay sheet cannot show different shipping methods per merchant.
// For multi-bag carts, only the first bag's shipping methods are shown.
// The doc recommends using the payment-only flow for multi-merchant carts.
//
// @see https://docs.violet.io/prism/checkout-guides/guides/violet-checkout-with-apple-pay

function WalletCheckoutForm({
  clientSecret,
  appOrderId,
  violetCartId: _violetCartId,
  cartTotal,
  currency,
  onSuccess,
}: {
  clientSecret: string;
  appOrderId: string;
  violetCartId: string;
  cartTotal: number;
  currency: string;
  onSuccess: (orderId: string) => void;
}) {
  const stripe = useStripe();
  const [paymentRequest, setPaymentRequest] = useState<
    import("@stripe/stripe-js").PaymentRequest | null
  >(null);
  const [canMakePayment, setCanMakePayment] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stripe || !clientSecret) return;

    // Country code of the Stripe platform account — determines Apple Pay/Google Pay availability.
    // US for sandbox (Violet's internal Stripe), FR for production (our Stripe platform account).
    // @see https://stripe.com/docs/js/payment_request
    const accountCountry = import.meta.env.VITE_STRIPE_ACCOUNT_COUNTRY || "US";

    const pr = stripe.paymentRequest({
      country: accountCountry,
      currency: currency.toLowerCase(),
      total: {
        label: "Order Total",
        amount: cartTotal,
      },
      requestPayerName: true,
      requestPayerEmail: true,
      requestShipping: true,
    });

    pr.canMakePayment().then((result) => {
      if (result) {
        setPaymentRequest(pr);
        setCanMakePayment(true);
      }
    });

    return () => {
      // Cleanup listeners
      pr.off("shippingaddresschange");
      pr.off("shippingoptionchange");
      pr.off("paymentmethod");
    };
  }, [stripe, clientSecret, cartTotal, currency]);

  // ── shippingaddresschange ──────────────────────────────────────────
  // Apple Pay returns the shipping address but omits address_1 for privacy.
  // Violet allows empty string for address_1 on wallet-based carts at this stage.
  // The real address is provided after payment confirmation in the submit step.
  useEffect(() => {
    if (!paymentRequest) return;

    paymentRequest.on("shippingaddresschange", async (event) => {
      const addr = event.shippingAddress;

      try {
        // Step 1: Apply customer info with partial address (empty address_1)
        await setShippingAddressFn({
          data: {
            address1: "", // Apple redacts this until payment confirmed
            city: addr.city ?? "",
            state: addr.region ?? "",
            postalCode: addr.postalCode ?? "",
            country: addr.country ?? "US",
          },
        });

        // Step 2: Fetch available shipping methods
        const methodsResult = await getAvailableShippingMethodsFn();

        if (methodsResult.error || !methodsResult.data) {
          event.updateWith({ status: "invalid_shipping_address" });
          return;
        }

        // Collect all shipping methods across all bags
        const allMethods = methodsResult.data.flatMap((b) => b.shippingMethods);

        if (allMethods.length === 0) {
          event.updateWith({ status: "invalid_shipping_address" });
          return;
        }

        const shippingOptions = allMethods.map((m, i) => ({
          id: m.id || String(i),
          label: m.label,
          detail: m.carrier ?? "",
          amount: m.price,
        }));

        // Update total with first shipping method price
        const shippingCost = allMethods[0]?.price ?? 0;
        event.updateWith({
          status: "success",
          shippingOptions,
          total: { label: "Order Total", amount: cartTotal + shippingCost },
        });
      } catch {
        event.updateWith({ status: "invalid_shipping_address" });
      }
    });
  }, [paymentRequest, cartTotal]);

  // ── shippingoptionchange ──────────────────────────────────────────
  useEffect(() => {
    if (!paymentRequest) return;

    paymentRequest.on("shippingoptionchange", async (event) => {
      try {
        // Get available methods to find the matching one
        const methodsResult = await getAvailableShippingMethodsFn();
        if (methodsResult.error || !methodsResult.data) {
          event.updateWith({ status: "fail" });
          return;
        }

        // Find the method matching the selected option
        const allMethods = methodsResult.data.flatMap((b) => b.shippingMethods);
        const selected = allMethods.find(
          (m) => m.id === event.shippingOption.id || m.label === event.shippingOption.label,
        );

        if (!selected) {
          event.updateWith({ status: "fail" });
          return;
        }

        // Apply shipping method to all bags
        const selections = methodsResult.data.map((bag) => ({
          bagId: bag.bagId,
          shippingMethodId: selected.id,
        }));

        await setShippingMethodsFn({ data: { selections } });

        event.updateWith({
          status: "success",
          total: { label: "Order Total", amount: cartTotal + selected.price },
        });
      } catch {
        event.updateWith({ status: "fail" });
      }
    });
  }, [paymentRequest, cartTotal]);

  // ── paymentmethod (confirm + submit) ──────────────────────────────
  useEffect(() => {
    if (!paymentRequest) return;

    paymentRequest.on("paymentmethod", async (ev) => {
      setSubmitting(true);
      setError(null);

      if (!stripe) {
        ev.complete("fail");
        setError("Stripe not loaded");
        setSubmitting(false);
        return;
      }

      try {
        // Step 1: Confirm the payment intent with the wallet payment method
        const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false },
        );

        if (confirmError) {
          ev.complete("fail");
          setError(confirmError.message ?? "Payment failed");
          setSubmitting(false);
          return;
        }

        // Report success to close the Apple Pay / Google Pay sheet
        ev.complete("success");

        // Step 2: Handle 3D Secure if required
        if (paymentIntent?.status === "requires_action") {
          const { error: actionError } = await stripe.confirmCardPayment(clientSecret);
          if (actionError) {
            setError(actionError.message ?? "3D Secure authentication failed");
            setSubmitting(false);
            return;
          }
        }

        // Step 3: Submit to Violet with order_customer containing the full address
        // Apple now provides the unredacted address (including address_1)
        const walletName = ev.paymentMethod.billing_details?.name ?? "";
        const nameParts = walletName.split(" ");
        const firstName = nameParts[0] || ev.payerName?.split(" ")[0] || "";
        const lastName =
          nameParts.slice(1).join(" ") || ev.payerName?.split(" ").slice(1).join(" ") || "";

        // ev.shippingAddress is PaymentRequestShippingAddress (addressLine, region, city...)
        // ev.paymentMethod.billing_details.address is Stripe Address (line1, state, postal_code...)
        const shippingAddr = ev.shippingAddress;
        const billingAddr = ev.paymentMethod.billing_details?.address;

        // Build order_customer with the full address from the wallet
        const hasShippingAddress =
          shippingAddr && (shippingAddr.addressLine?.[0] || shippingAddr.city);

        const result = await submitOrderFn({
          data: {
            appOrderId,
            orderCustomer: hasShippingAddress
              ? {
                  firstName,
                  lastName,
                  email: ev.payerEmail ?? "",
                  shippingAddress: {
                    address1: shippingAddr!.addressLine?.[0] ?? "",
                    city: shippingAddr!.city ?? "",
                    state: shippingAddr!.region ?? "",
                    postalCode: shippingAddr!.postalCode ?? "",
                    country: shippingAddr!.country ?? "US",
                  },
                  sameAddress: true,
                  // Include billing address if different
                  ...(billingAddr && billingAddr.line1
                    ? {
                        sameAddress: false as const,
                        billingAddress: {
                          address1: billingAddr.line1,
                          city: billingAddr.city ?? "",
                          state: billingAddr.state ?? "",
                          postalCode: billingAddr.postal_code ?? "",
                          country: billingAddr.country ?? "US",
                        },
                      }
                    : {}),
                }
              : undefined,
          },
        });

        if (result.error) {
          setError(result.error.message);
          setSubmitting(false);
          return;
        }

        // Handle partial success / 3DS
        if (result.data?.status === "REQUIRES_ACTION") {
          const secret = result.data.paymentIntentClientSecret;
          if (secret) {
            const { error: actionError } = await stripe!.handleNextAction({ clientSecret: secret });
            if (!actionError) {
              const retryResult = await submitOrderFn({ data: { appOrderId } });
              if (!retryResult.error && retryResult.data?.status !== "REJECTED") {
                onSuccess(retryResult.data?.id ?? "");
                return;
              }
            }
          }
          setError("Payment verification failed. Please try again.");
          setSubmitting(false);
          return;
        }

        if (result.data?.status === "REJECTED" || result.data?.status === "CANCELED") {
          setError("Your order could not be completed. Your card was not charged.");
          setSubmitting(false);
          return;
        }

        onSuccess(result.data?.id ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
        setSubmitting(false);
      }
    });
  }, [paymentRequest, clientSecret, appOrderId, stripe, onSuccess]);

  if (!canMakePayment || !paymentRequest) {
    return null;
  }

  return (
    <div className="checkout__wallet">
      <PaymentRequestButtonElement
        options={{
          paymentRequest,
          style: {
            paymentRequestButton: {
              type: "default",
              theme: "dark",
              height: "48px",
            },
          },
        }}
      />
      {isSubmitting && (
        <p
          className="checkout__wallet-status"
          style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--color-steel)" }}
        >
          Processing your order…
        </p>
      )}
      {error && (
        <p
          className="checkout__wallet-error"
          style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--color-danger)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

const CHECKOUT_STORAGE_KEY = "checkout-form";

interface CheckoutPersistedState {
  step: CheckoutStep;
  address: AddressFormState;
  selectedMethods: Record<string, string>;
  guestInfo: CustomerInput;
  billingSameAsShipping: boolean;
  billingAddress: AddressFormState;
}

function readCheckoutStorage(): Partial<CheckoutPersistedState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<CheckoutPersistedState>) : {};
  } catch {
    return {};
  }
}

function clearCheckoutStorage() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
  }
}

// ─── CheckoutPage ─────────────────────────────────────────────────────────

function CheckoutPage() {
  const { violetCartId, cartHealth, setCartHealth, resetCart } = useCartContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, isAnonymous } = useAuthSession();
  const { data: cartResponse, isLoading: isCartLoading } = useCartQuery(violetCartId, fetchCart);
  const cart = cartResponse?.data ?? null;

  // ── Checkout flow step ──────────────────────────────────────────────
  const [step, setStep] = useState<CheckoutStep>(() => {
    const saved = readCheckoutStorage().step;
    // "payment" can't be restored — clientSecret is transient
    // "methods" can't be restored — availableMethods must be re-fetched
    if (saved === "payment" || saved === "methods") return "address";
    return saved ?? "address";
  });

  // ── Story 4.7: Checkout error state ─────────────────────────────────
  const [checkoutErrors, setCheckoutErrors] = useState<CheckoutError[]>([]);
  const [showInventoryAlert, setShowInventoryAlert] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);

  /**
   * Detect cart-level errors from the cart response (Violet 200-with-errors or API failure).
   *
   * ## Why useEffect instead of render-phase check (Code Review Fix — M1)
   * The original implementation called setState during render (before JSX return).
   * While React batches render-phase state updates to avoid infinite loops, this
   * pattern is fragile:
   * - React StrictMode calls render twice in dev, potentially double-triggering
   * - It makes the data flow harder to reason about (side effects hidden in render)
   * - useEffect is the idiomatic way to react to prop/state changes
   *
   * The guards are still necessary: `cartHealth === "healthy"` and
   * `checkoutErrors.length === 0` prevent re-setting state when it's already set.
   */
  useEffect(() => {
    if (!cartResponse?.error || cartHealth !== "healthy") return;

    if (
      cartResponse.error.code === "VIOLET.NOT_FOUND" ||
      cartResponse.error.code === "DB.CART_NOT_FOUND"
    ) {
      setCartHealth("expired");
    } else if (checkoutErrors.length === 0) {
      setCheckoutErrors([
        {
          code: cartResponse.error.code,
          message: cartResponse.error.message,
          severity: "error",
          retryable: true,
        },
      ]);
    }
  }, [cartResponse?.error, cartHealth, checkoutErrors.length, setCartHealth]);

  // ── Story 4.7: Retry prompt state ───────────────────────────────────
  const [retryState, setRetryState] = useState<{
    show: boolean;
    operationName: string;
    retryCount: number;
    retryFn: (() => Promise<void>) | null;
    cancelFn: (() => void) | null;
  }>({ show: false, operationName: "", retryCount: 0, retryFn: null, cancelFn: null });
  const [isRetrying, setIsRetrying] = useState(false);

  /**
   * Timeout retry with built-in max retry limit prevents unbounded recursion.
   * The retry count is tracked internally rather than relying solely on UI-level checks.
   *
   * ## Why this exists (Code Review Fix — H2)
   * The original implementation created the RetryPrompt component and state but never
   * triggered it. No Server Function call had timeout detection, making the retry UX
   * dead code. This helper:
   * 1. Races the Server Function against a timeout (default 30s — Violet's max response time)
   * 2. On timeout: shows the RetryPrompt overlay (user-initiated retry, NOT automatic)
   * 3. Preserves all form state (the caller's local state is untouched)
   * 4. Returns the server result on success, or null on timeout (caller checks retryState)
   * 5. Stops recursing after `maxRetries` attempts to prevent unbounded retry loops
   *
   * @param operationName - Human-readable label for the retry prompt (e.g., "saving your address")
   * @param serverCall - The Server Function call (async)
   * @param onCancel - Called when user cancels from retry prompt (e.g., go back to previous step)
   * @param timeoutMs - Timeout in milliseconds (default 30000)
   * @param maxRetries - Maximum number of retry attempts before giving up (default 3)
   * @param _currentAttempt - Internal counter, do not pass manually
   * @returns The server result, or `null` if timed out (retry prompt is now showing)
   */
  const withTimeoutRetry = useCallback(
    async <T,>(
      operationName: string,
      serverCall: () => Promise<T>,
      onCancel: () => void,
      timeoutMs = 30000,
      maxRetries = 3,
      _currentAttempt = 0,
    ): Promise<T | null> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const result = await Promise.race([
          serverCall(),
          new Promise<never>((_resolve, reject) => {
            controller.signal.addEventListener("abort", () => reject(new Error("TIMEOUT")));
          }),
        ]);
        clearTimeout(timeout);
        return result;
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.message === "TIMEOUT") {
          const nextAttempt = _currentAttempt + 1;

          if (nextAttempt >= maxRetries) {
            setRetryState({
              show: false,
              operationName: "",
              retryCount: nextAttempt,
              retryFn: null,
              cancelFn: null,
            });
            onCancel();
            return null;
          }

          setRetryState((prev) => ({
            show: true,
            operationName,
            retryCount: prev.retryCount + 1,
            retryFn: async () => {
              const retryResult = await withTimeoutRetry(
                operationName,
                serverCall,
                onCancel,
                timeoutMs,
                maxRetries,
                nextAttempt,
              );
              if (retryResult !== null) {
                setRetryState((p) => ({ ...p, show: false }));
              }
            },
            cancelFn: onCancel,
          }));
          return null;
        }
        throw err;
      }
    },
    [],
  );

  // ── Story 4.7: Cart recovery ────────────────────────────────────────
  const handleCartRecoveryRetry = useCallback(async () => {
    if (!violetCartId) return;
    setCartHealth("stale");
    const result = await getCartFn({ data: violetCartId });
    if (result.error) {
      setCartHealth("expired");
    } else {
      setCartHealth("healthy");
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    }
  }, [violetCartId, setCartHealth, queryClient]);

  const handleStartFresh = useCallback(() => {
    resetCart();
    navigate({ to: "/" });
  }, [resetCart, navigate]);

  /**
   * Item action handlers for error components (Story 4.7).
   *
   * Server errors must be checked even with optimistic updates because the server
   * mutation may fail (e.g., item out of stock, cart expired) while the optimistic
   * UI shows success. Without checking, the user sees a stale UI that diverges from
   * the actual cart state on the server.
   */
  /** Find orderSkuId (item.id) for a given skuId by scanning cart bags. */
  const findOrderSkuId = useCallback(
    (skuId: string): string => {
      if (!cart) return skuId;
      for (const bag of cart.bags) {
        const item = bag.items.find((i) => i.skuId === skuId);
        if (item) return item.id;
      }
      return skuId;
    },
    [cart],
  );

  const handleRemoveItem = useCallback(
    async (skuId: string) => {
      if (!violetCartId) return;
      const orderSkuId = findOrderSkuId(skuId);
      const result = await removeFromCartFn({ data: { violetCartId, orderSkuId, skuId } });
      if (result.error) {
        setCheckoutErrors((prev) => [
          ...prev,
          {
            code: result.error!.code,
            message: result.error!.message,
            severity: "error" as const,
            retryable: true,
          },
        ]);
      }
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    [violetCartId, queryClient, findOrderSkuId],
  );

  const handleUpdateQuantity = useCallback(
    async (skuId: string, quantity: number) => {
      if (!violetCartId) return;
      const orderSkuId = findOrderSkuId(skuId);
      const result = await updateCartItemFn({
        data: { violetCartId, orderSkuId, skuId, quantity },
      });
      if (result.error) {
        setCheckoutErrors((prev) => [
          ...prev,
          {
            code: result.error!.code,
            message: result.error!.message,
            severity: "error" as const,
            retryable: true,
          },
        ]);
      }
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    [violetCartId, queryClient, findOrderSkuId],
  );

  // ── Story 4.7: Pre-submit inventory validation ──────────────────────
  const validateInventoryBeforeSubmit = useCallback(async (): Promise<boolean> => {
    if (!violetCartId) return false;
    setIsRevalidating(true);
    const result = await getCartFn({ data: violetCartId });
    setIsRevalidating(false);

    if (result.error) {
      setCartHealth("expired");
      return false;
    }

    const bagsWithErrors = result.data?.bags.filter((b) => b.errors.length > 0) ?? [];
    if (bagsWithErrors.length > 0) {
      setShowInventoryAlert(true);
      return false;
    }

    return true;
  }, [violetCartId, setCartHealth]);

  /**
   * Re-validates cart inventory after a user action (remove/update) in the InventoryAlert overlay.
   *
   * ## Why this exists (Code Review Fix — H1)
   * After removing or updating an item to resolve an inventory issue, we must re-fetch
   * the cart from Violet to check if OTHER items still have errors. Without this,
   * the overlay would close immediately — and the user could proceed to checkout with
   * remaining inventory problems (e.g., 2 items out of stock, user removes 1, the other
   * is still broken but the overlay disappeared).
   *
   * @returns `true` if there are still bags with errors, `false` if all clear
   */
  const revalidateAfterInventoryAction = useCallback(async (): Promise<boolean> => {
    if (!violetCartId) return false;
    setIsRevalidating(true);
    queryClient.invalidateQueries({ queryKey: ["cart"] });
    const result = await getCartFn({ data: violetCartId });
    setIsRevalidating(false);

    if (result.error) {
      setCartHealth("expired");
      return false;
    }

    const bagsWithErrors = result.data?.bags.filter((b) => b.errors.length > 0) ?? [];
    return bagsWithErrors.length > 0;
  }, [violetCartId, setCartHealth, queryClient]);

  // ── Address form ────────────────────────────────────────────────────
  const [address, setAddress] = useState<AddressFormState>(() => {
    return (
      readCheckoutStorage().address ?? {
        address1: "",
        city: "",
        state: "",
        postalCode: "",
        country: STRIPE_PLATFORM_COUNTRY === "US" ? "US" : STRIPE_PLATFORM_COUNTRY,
        phone: "",
      }
    );
  });
  const [addressErrors, setAddressErrors] = useState<AddressFormErrors>({});
  const [isAddressSubmitting, setIsAddressSubmitting] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // ── Shipping methods ────────────────────────────────────────────────
  const [availableMethods, setAvailableMethods] = useState<ShippingMethodsAvailable[]>([]);
  const [bagLoadingState, setBagLoadingState] = useState<Record<string, boolean>>({});
  const [bagErrorState, setBagErrorState] = useState<Record<string, string>>({});
  const [selectedMethods, setSelectedMethods] = useState<Record<string, string>>(
    () => readCheckoutStorage().selectedMethods ?? {},
  );

  // ── Continue to payment ─────────────────────────────────────────────
  const [isSubmittingShipping, setIsSubmittingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  // ── Guest info (Story 4.4) ──────────────────────────────────────────
  const [guestInfo, setGuestInfo] = useState<CustomerInput>(() => {
    return (
      readCheckoutStorage().guestInfo ?? {
        email: "",
        firstName: "",
        lastName: "",
        marketingConsent: false,
      }
    );
  });
  const [guestError, setGuestError] = useState<string | null>(null);
  const [isGuestSubmitting, setIsGuestSubmitting] = useState(false);

  // ── Billing address (Story 4.4) ─────────────────────────────────────
  const [billingSameAsShipping, setBillingSameAsShipping] = useState<boolean>(
    () => readCheckoutStorage().billingSameAsShipping ?? true,
  );
  const [billingAddress, setBillingAddress] = useState<AddressFormState>(() => {
    return (
      readCheckoutStorage().billingAddress ?? {
        address1: "",
        city: "",
        state: "",
        postalCode: "",
        country: STRIPE_PLATFORM_COUNTRY === "US" ? "US" : STRIPE_PLATFORM_COUNTRY,
        phone: "",
      }
    );
  });
  const [billingError, setBillingError] = useState<string | null>(null);
  const [isBillingSubmitting, setIsBillingSubmitting] = useState(false);

  // ── Discount / Promo code ───────────────────────────────────────────
  const [promoCode, setPromoCode] = useState("");
  const [isPromoSubmitting, setIsPromoSubmitting] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  // ── Stripe payment (Story 4.4) ──────────────────────────────────────
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  /**
   * Stable order ID for idempotency — generated once per checkout session.
   *
   * `useRef` ensures the UUID persists across re-renders without triggering
   * re-renders itself. Reused for 3DS retries to prevent duplicate orders.
   *
   * @see Story 4.4 AC#13 — idempotency via appOrderId
   */
  const appOrderIdRef = useRef(crypto.randomUUID());

  // Persist form state across navigations — cleared on order success (Bug #10 fix)
  useEffect(() => {
    const state: CheckoutPersistedState = {
      step,
      address,
      selectedMethods,
      guestInfo,
      billingSameAsShipping,
      billingAddress,
    };
    sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(state));
  }, [step, address, selectedMethods, guestInfo, billingSameAsShipping, billingAddress]);

  // Only physical bags need shipping methods — digital bags are excluded.
  const physicalBags = cart?.bags.filter((b) => !b.isDigital) ?? [];
  const allBagsSelected =
    availableMethods.length > 0 &&
    availableMethods.every((bag) => Boolean(selectedMethods[bag.bagId]));

  // ── Address field change ────────────────────────────────────────────
  function handleAddressChange(field: keyof AddressFormState, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));
    if (addressErrors[field]) {
      setAddressErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  // ── Address validation ──────────────────────────────────────────────
  function validateAddress(): boolean {
    const errors: AddressFormErrors = {};
    if (!address.address1.trim()) errors.address1 = "Street address is required";
    if (!address.city.trim()) errors.city = "City is required";
    if (!address.state.trim()) errors.state = "State / province is required";
    // Postal code is required for most countries but exempt for ~60 countries.
    // @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/customers — Postal Code Requirements
    if (!address.postalCode.trim() && !COUNTRIES_WITHOUT_POSTAL_CODE.has(address.country)) {
      errors.postalCode = "Postal code is required";
    }
    if (!address.country) errors.country = "Country is required";
    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Fetch available methods ─────────────────────────────────────────
  async function fetchAvailableShippingMethods() {
    if (!cart) return;

    // Only fetch shipping methods for physical bags — digital bags don't need shipping.
    const bagsNeedingShipping = cart.bags.filter((b) => !b.isDigital);
    if (bagsNeedingShipping.length === 0) return;

    const loadingMap: Record<string, boolean> = {};
    bagsNeedingShipping.forEach((b) => (loadingMap[b.id] = true));
    setBagLoadingState(loadingMap);
    setBagErrorState({});

    const result = await getAvailableShippingMethodsFn();

    if (result.error) {
      const errorMap: Record<string, string> = {};
      bagsNeedingShipping.forEach((b) => (errorMap[b.id] = result.error!.message));
      setBagErrorState(errorMap);
      setBagLoadingState({});
      return;
    }

    const methods = result.data ?? [];
    setAvailableMethods(methods);
    setBagLoadingState({});

    const errorMap: Record<string, string> = {};
    bagsNeedingShipping.forEach((b) => {
      const found = methods.find((m) => m.bagId === b.id);
      if (!found || found.shippingMethods.length === 0) {
        errorMap[b.id] = "No shipping methods available for this merchant.";
      }
    });
    setBagErrorState(errorMap);

    // Auto-select shipping methods:
    // 1. Single option → auto-select (AC#7)
    // 2. Multiple options → prefer "Standard" label (matches PDP delivery estimates)
    const autoSelections: Record<string, string> = {};
    for (const bagMethods of methods) {
      if (bagMethods.shippingMethods.length === 1) {
        autoSelections[bagMethods.bagId] = bagMethods.shippingMethods[0].id;
      } else if (bagMethods.shippingMethods.length > 1) {
        const standard = bagMethods.shippingMethods.find((m) =>
          m.label?.toLowerCase().includes("standard"),
        );
        if (standard) {
          autoSelections[bagMethods.bagId] = standard.id;
        }
      }
    }
    if (Object.keys(autoSelections).length > 0) {
      setSelectedMethods((prev) => ({ ...autoSelections, ...prev }));
    }
  }

  // ── Address submit ──────────────────────────────────────────────────
  async function handleAddressSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAddress()) return;

    setIsAddressSubmitting(true);
    setAddressError(null);

    const addressInput: ShippingAddressInput = {
      address1: address.address1,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      ...(address.phone.trim() ? { phone: address.phone.trim() } : {}),
    };

    /**
     * Wrapped with timeout detection (Code Review Fix — H2).
     * If Violet's shipping address API takes > 30s, the retry prompt appears
     * instead of leaving the user staring at a spinner indefinitely.
     */
    const result = await withTimeoutRetry(
      "saving your address",
      () => setShippingAddressFn({ data: addressInput }),
      () => setIsAddressSubmitting(false),
    );

    if (!result) return; // Timeout — retry prompt is showing

    if (result.error) {
      setAddressError(result.error.message);
      setIsAddressSubmitting(false);
      return;
    }

    setStep("methods");
    setIsAddressSubmitting(false);

    // ── Digital product skip-shipping logic ─────────────────────────
    // Per Violet docs: "When all SKUs in a bag are digital, you should skip
    // the shipping method selection during checkout."
    // If ALL bags are digital, skip methods+confirmed and go directly to payment.
    // @see https://docs.violet.io/prism/catalog/skus — Digital Product Delivery
    if (cart?.allBagsDigital) {
      setStep("guestInfo");
      return;
    }

    await fetchAvailableShippingMethods();
  }

  // ── Retry shipping methods ──────────────────────────────────────────
  async function handleRetryBag(bagId: string) {
    setBagErrorState((prev) => {
      const next = { ...prev };
      delete next[bagId];
      return next;
    });
    await fetchAvailableShippingMethods();
  }

  // ── Continue to payment (shipping confirm) ──────────────────────────
  async function handleContinueToPayment() {
    if (!allBagsSelected) return;

    setIsSubmittingShipping(true);
    setShippingError(null);

    const selections = Object.entries(selectedMethods).map(([bagId, shippingMethodId]) => ({
      bagId,
      shippingMethodId,
    }));

    /** Wrapped with timeout detection (Code Review Fix — H2). */
    const result = await withTimeoutRetry(
      "confirming shipping",
      () => setShippingMethodsFn({ data: { selections } }),
      () => setIsSubmittingShipping(false),
    );

    if (!result) return; // Timeout — retry prompt showing

    if (result.error) {
      setShippingError(result.error.message);
      setIsSubmittingShipping(false);
      return;
    }

    /**
     * Price Cart — tax_total check per Violet docs.
     *
     * "When building your own integration, there are instances where carts are
     * not priced automatically after applying shipping methods. You will know
     * this is needed when the response from the apply shipping methods call has
     * a 0 value for tax_total. If that happens, make a call to price cart before
     * calling submit."
     *
     * @see https://docs.violet.io/prism/overview/place-an-order/submit-cart
     * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-pricing/price-cart
     */
    const pricedCart = result.data;
    const needsPricing =
      pricedCart?.bags.some((bag) => bag.subtotal > 0 && bag.tax === 0 && bag.shippingTotal >= 0) ??
      false;

    if (needsPricing) {
      const priceResult = await priceCartFn();
      if (priceResult.error) {
        // Non-fatal: pricing may succeed at submit time. Log but don't block.
        // The user can still proceed — submit will attempt pricing again.
        logClientErrorFn({
          data: {
            error_type: "CHECKOUT.PRICE_CART_FAILED",
            message: priceResult.error.message,
            context: { step: "priceCart", violetCartId },
          },
        });
      }
    }

    if (violetCartId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cart.detail(violetCartId) });
    }

    setStep("guestInfo");
    setIsSubmittingShipping(false);
  }

  // ── Guest info submit ───────────────────────────────────────────────
  async function handleGuestInfoSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!guestInfo.email.trim() || !guestInfo.firstName.trim() || !guestInfo.lastName.trim()) {
      setGuestError("Email, first name, and last name are required.");
      return;
    }

    setIsGuestSubmitting(true);
    setGuestError(null);

    /** Wrapped with timeout detection (Code Review Fix — H2). */
    const result = await withTimeoutRetry(
      "saving your contact info",
      () => setCustomerFn({ data: guestInfo }),
      () => setIsGuestSubmitting(false),
    );

    if (!result) return; // Timeout — retry prompt showing

    if (result.error) {
      setGuestError(result.error.message);
      setIsGuestSubmitting(false);
      return;
    }

    setStep("billing");
    setIsGuestSubmitting(false);
  }

  // ── Billing address confirm ─────────────────────────────────────────
  async function handleBillingConfirm(e: React.FormEvent) {
    e.preventDefault();

    setIsBillingSubmitting(true);
    setBillingError(null);

    // Violet requires billing_address on every order, even when same as shipping.
    const effectiveBilling = billingSameAsShipping
      ? {
          address1: address.address1,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: address.country,
        }
      : billingAddress;

    if (!billingSameAsShipping) {
      if (
        !billingAddress.address1.trim() ||
        !billingAddress.city.trim() ||
        !billingAddress.state.trim() ||
        (!billingAddress.postalCode.trim() &&
          !COUNTRIES_WITHOUT_POSTAL_CODE.has(billingAddress.country)) ||
        !billingAddress.country
      ) {
        setBillingError("All billing address fields are required.");
        setIsBillingSubmitting(false);
        return;
      }
    }

    const billingResult = await setBillingAddressFn({
      data: {
        address1: effectiveBilling.address1,
        city: effectiveBilling.city,
        state: effectiveBilling.state,
        postalCode: effectiveBilling.postalCode,
        country: effectiveBilling.country,
      },
    });

    if (billingResult.error) {
      setBillingError(billingResult.error.message);
      setIsBillingSubmitting(false);
      return;
    }

    // Fetch PaymentIntent client secret from Violet (GET /cart → extract secret)
    setPaymentError(null);
    const piResult = await getPaymentIntentFn();

    if (piResult.error) {
      setPaymentError(piResult.error.message);
      setIsBillingSubmitting(false);
      return;
    }

    const stripeKey =
      piResult.data!.stripePublishableKey ?? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
    setStripePromise(getStripePromise(stripeKey));
    setClientSecret(piResult.data!.clientSecret);
    setStep("payment");
    setIsBillingSubmitting(false);
  }

  // ── Discount / Promo code ────────────────────────────────────────────
  async function handleApplyPromo(e: React.FormEvent) {
    e.preventDefault();
    if (!promoCode.trim() || !cart || isPromoSubmitting) return;

    // Auto-detect merchant_id from bags
    // For single-bag carts, use that bag's merchant. For multi-bag, use the first.
    const targetBag = cart.bags[0];
    if (!targetBag) return;

    setIsPromoSubmitting(true);
    setPromoError(null);

    // Use guest email if available (for customer-restricted discounts)
    const email = guestInfo.email.trim() || undefined;

    const result = await addDiscountFn({
      data: {
        code: promoCode.trim(),
        merchantId: targetBag.merchantId,
        ...(email ? { email } : {}),
      },
    });

    if (result.error) {
      setPromoError(result.error.message);
      setIsPromoSubmitting(false);
      return;
    }

    setPromoCode("");
    setIsPromoSubmitting(false);
    if (violetCartId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cart.detail(violetCartId) });
    }
  }

  async function handleRemoveDiscount(discountId: string) {
    if (!violetCartId) return;

    const result = await removeDiscountFn({ data: { discountId } });
    if (result.error) {
      setPromoError(result.error.message);
      return;
    }

    setPromoError(null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.cart.detail(violetCartId) });
  }

  // ── Order success handler ───────────────────────────────────────────

  /**
   * Story 5.1 (Code Review Fix C1): Wire up order persistence.
   *
   * After Violet submit succeeds, we persist the order to Supabase for:
   * - Local queries and order history (Supabase mirrors Violet data)
   * - Guest lookup tokens (SHA-256 hashed, stored server-side)
   * - Email queue tracking (email_sent flag)
   *
   * ## Why fire-and-forget on failure
   * Violet is the source of truth. If Supabase persistence fails, the order
   * still exists in Violet — we log the error but never block the user from
   * seeing their confirmation. The confirmation page fetches from Violet as
   * its primary source regardless.
   *
   * ## Guest token flow
   * For anonymous/guest users (isAnonymous=true), the server generates a
   * crypto-random token, hashes it, stores the hash in Supabase, and returns
   * the plaintext token exactly once. We pass it as a URL search param so the
   * confirmation page can display it with copy-to-clipboard.
   */
  async function handleOrderSuccess(orderId: string) {
    // Clear persisted form state — order is complete, no need to restore it
    clearCheckoutStorage();

    // Clear cart state + cookie so CartDrawer shows empty and next addToCart creates a fresh cart
    await resetCart();

    /**
     * Persist order to Supabase (Story 5.1).
     * Pass userId=null for anonymous users so the server generates a guest lookup token.
     * Session ID is the Supabase auth user UUID even for anonymous users — it's used
     * as a fallback identifier in the orders table for anonymous-to-authenticated upgrades.
     */
    let guestToken: string | undefined;
    try {
      const persistResult = await persistAndConfirmOrderFn({
        data: {
          violetOrderId: orderId,
          userId: isAnonymous ? null : (user?.id ?? null),
          sessionId: user?.id ?? null,
        },
      });
      guestToken = persistResult.data?.orderLookupToken;
    } catch {
      // Persistence failure is non-blocking — Violet has the order data.
      // Error is already logged server-side by persistAndConfirmOrderFn.
    }

    // Navigate to confirmation — include guest token as search param if present
    navigate({
      to: `/order/${orderId}/confirmation` as string,
      search: guestToken ? { token: guestToken } : undefined,
    });
  }

  // ── Aggregate totals ───────────────────────────────────────────────
  const subtotalAll = cart?.bags.reduce((sum, b) => sum + b.subtotal, 0) ?? 0;
  const taxAll = cart?.bags.reduce((sum, b) => sum + b.tax, 0) ?? 0;
  const shippingAll = cart?.bags.reduce((sum, b) => sum + b.shippingTotal, 0) ?? 0;
  const discountAll = cart?.bags.reduce((sum, b) => sum + b.discountTotal, 0) ?? 0;
  // All discounts applied to bags across all merchants
  const allDiscounts = cart?.bags.flatMap((b) => b.discounts) ?? [];
  const totalAll = subtotalAll + taxAll + shippingAll - discountAll;

  // ── Loading / empty states ──────────────────────────────────────────
  if (isCartLoading) {
    return (
      <div className="page-wrap">
        <div className="checkout">
          <div className="checkout__bag-loading">
            <div className="checkout__bag-loading-item" />
            <div className="checkout__bag-loading-item" />
            <div className="checkout__bag-loading-item" />
          </div>
        </div>
      </div>
    );
  }

  // ── Story 4.7: Cart recovery overlay ──────────────────────────────
  if (cartHealth !== "healthy") {
    return (
      <div className="page-wrap">
        <div className="checkout">
          <h1 className="checkout__title">Checkout</h1>
          <CartRecovery
            cartHealth={cartHealth}
            onStartFresh={handleStartFresh}
            onRetry={handleCartRecoveryRetry}
          />
        </div>
      </div>
    );
  }

  if (!violetCartId || !cart || cart.bags.length === 0) {
    return (
      <div className="page-wrap">
        <div className="checkout">
          <h1 className="checkout__title">Checkout</h1>
          <p>Your cart is empty. Add items before proceeding to checkout.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="checkout">
        <h1 className="checkout__title">Checkout</h1>

        {/* Story 4.7: Cart-level error banner */}
        {checkoutErrors.length > 0 && (
          <div className="checkout-error" role="alert">
            {checkoutErrors.map((err, idx) => (
              <p key={idx} className="checkout-error__message">
                {err.message}
              </p>
            ))}
          </div>
        )}

        {/* Story 4.7: Inventory validation overlay */}
        {/**
         * Story 4.7 AC#1: Inventory validation overlay.
         *
         * ## Re-validation after actions (Code Review Fix — H1)
         * The original implementation closed the overlay immediately after
         * remove/update without re-checking if OTHER items still had errors.
         * Now: after each action, we re-fetch the cart from Violet and only
         * close the overlay when all bags have zero errors.
         *
         * Flow: user action → server mutation → re-fetch cart → check errors →
         *   if clean: close overlay. If still errors: keep overlay open with updated data.
         */}
        {showInventoryAlert && cart && (
          <InventoryAlert
            bags={cart.bags}
            onRemoveItem={async (skuId) => {
              await handleRemoveItem(skuId);
              const stillHasErrors = await revalidateAfterInventoryAction();
              if (!stillHasErrors) setShowInventoryAlert(false);
            }}
            onUpdateQuantity={async (skuId, qty) => {
              await handleUpdateQuantity(skuId, qty);
              const stillHasErrors = await revalidateAfterInventoryAction();
              if (!stillHasErrors) setShowInventoryAlert(false);
            }}
            onDismiss={() => setShowInventoryAlert(false)}
            isRevalidating={isRevalidating}
          />
        )}

        {/* Story 4.7: Retry prompt */}
        {retryState.show && (
          <RetryPrompt
            operationName={retryState.operationName}
            retryCount={retryState.retryCount}
            isRetrying={isRetrying}
            onRetry={async () => {
              setIsRetrying(true);
              if (retryState.retryFn) await retryState.retryFn();
              setIsRetrying(false);
              setRetryState((prev) => ({ ...prev, show: false }));
            }}
            onCancel={() => {
              if (retryState.cancelFn) retryState.cancelFn();
              setRetryState((prev) => ({ ...prev, show: false }));
            }}
          />
        )}

        <div className="checkout__layout">
          {/* ── Left: form ── */}
          <div className="checkout__form">
            {/* ── Section 1: Shipping address ── */}
            <section className="checkout__section" aria-labelledby="checkout-address-title">
              <h2 className="checkout__section-title" id="checkout-address-title">
                Shipping Address
              </h2>

              <form onSubmit={handleAddressSubmit} noValidate>
                <div
                  className={`checkout__field${addressErrors.address1 ? " checkout__field--error" : ""}`}
                >
                  <label className="checkout__field-label" htmlFor="address1">
                    Street Address
                  </label>
                  <input
                    id="address1"
                    className="checkout__field-input"
                    type="text"
                    value={address.address1}
                    onChange={(e) => handleAddressChange("address1", e.target.value)}
                    placeholder="123 Main Street"
                    autoComplete="street-address"
                    disabled={step !== "address"}
                  />
                  {addressErrors.address1 && (
                    <p className="checkout__field-error">{addressErrors.address1}</p>
                  )}
                </div>

                <div className="checkout__field-row checkout__field-row--3col">
                  <div
                    className={`checkout__field${addressErrors.city ? " checkout__field--error" : ""}`}
                  >
                    <label className="checkout__field-label" htmlFor="city">
                      City
                    </label>
                    <input
                      id="city"
                      className="checkout__field-input"
                      type="text"
                      value={address.city}
                      onChange={(e) => handleAddressChange("city", e.target.value)}
                      autoComplete="address-level2"
                      disabled={step !== "address"}
                    />
                    {addressErrors.city && (
                      <p className="checkout__field-error">{addressErrors.city}</p>
                    )}
                  </div>

                  <div
                    className={`checkout__field${addressErrors.state ? " checkout__field--error" : ""}`}
                  >
                    <label className="checkout__field-label" htmlFor="state">
                      State
                    </label>
                    <input
                      id="state"
                      className="checkout__field-input"
                      type="text"
                      value={address.state}
                      onChange={(e) => handleAddressChange("state", e.target.value)}
                      autoComplete="address-level1"
                      disabled={step !== "address"}
                    />
                    {addressErrors.state && (
                      <p className="checkout__field-error">{addressErrors.state}</p>
                    )}
                  </div>

                  <div
                    className={`checkout__field${addressErrors.postalCode ? " checkout__field--error" : ""}`}
                  >
                    <label className="checkout__field-label" htmlFor="postalCode">
                      ZIP / Postal
                    </label>
                    <input
                      id="postalCode"
                      className="checkout__field-input"
                      type="text"
                      value={address.postalCode}
                      onChange={(e) => handleAddressChange("postalCode", e.target.value)}
                      autoComplete="postal-code"
                      disabled={step !== "address"}
                    />
                    {addressErrors.postalCode && (
                      <p className="checkout__field-error">{addressErrors.postalCode}</p>
                    )}
                  </div>
                </div>

                <div
                  className={`checkout__field${addressErrors.country ? " checkout__field--error" : ""}`}
                >
                  <label className="checkout__field-label" htmlFor="country">
                    Country
                  </label>
                  <select
                    id="country"
                    className="checkout__field-select"
                    value={address.country}
                    onChange={(e) => handleAddressChange("country", e.target.value)}
                    autoComplete="country"
                    disabled={step !== "address"}
                  >
                    <option value="">Select a country…</option>
                    {SUPPORTED_COUNTRIES.map((code) => (
                      <option key={code} value={code}>
                        {COUNTRY_LABELS_MAP[code] ?? code}
                      </option>
                    ))}
                  </select>
                  {addressErrors.country && (
                    <p className="checkout__field-error">{addressErrors.country}</p>
                  )}
                </div>

                {/* Phone — optional, for carrier delivery notifications */}
                <div className="checkout__field">
                  <label className="checkout__field-label" htmlFor="phone">
                    Phone{" "}
                    <span
                      style={{ fontWeight: 400, fontSize: "0.8em", color: "var(--color-steel)" }}
                    >
                      (optional)
                    </span>
                  </label>
                  <input
                    id="phone"
                    className="checkout__field-input"
                    type="tel"
                    value={address.phone}
                    onChange={(e) => handleAddressChange("phone", e.target.value)}
                    placeholder="+1 555 123 4567"
                    autoComplete="tel"
                    disabled={step !== "address"}
                  />
                </div>

                {addressError && (
                  <p className="checkout__field-error" role="alert" style={{ marginTop: "1rem" }}>
                    {addressError}
                  </p>
                )}

                {step === "address" && (
                  <button
                    type="submit"
                    className="checkout__address-submit"
                    disabled={isAddressSubmitting}
                  >
                    {isAddressSubmitting ? "Saving address…" : "Continue →"}
                  </button>
                )}
              </form>

              {step !== "address" && (
                <p style={{ fontSize: "0.875rem", color: "var(--color-steel)", marginTop: "1rem" }}>
                  {address.address1}, {address.city}, {address.state} {address.postalCode},{" "}
                  {COUNTRY_LABELS_MAP[address.country] ?? address.country}
                  {address.phone ? <> · {address.phone}</> : null}
                  {" · "}
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-sienna)",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: "inherit",
                      textDecoration: "underline",
                    }}
                    onClick={() => {
                      setStep("address");
                      setAvailableMethods([]);
                      setSelectedMethods({});
                      setClientSecret(null);
                    }}
                  >
                    Edit
                  </button>
                </p>
              )}
            </section>

            {/* ── Section 2: Shipping methods ── */}
            {step !== "address" && (
              <section className="checkout__section" aria-labelledby="checkout-methods-title">
                <h2 className="checkout__section-title" id="checkout-methods-title">
                  Shipping Method
                </h2>

                <div className="checkout__shipping-methods">
                  {physicalBags.map((bag) => {
                    const isLoading = bagLoadingState[bag.id];
                    const error = bagErrorState[bag.id];
                    const bagMethods = availableMethods.find((m) => m.bagId === bag.id);

                    return (
                      <div key={bag.id}>
                        <p className="checkout__bag-title">
                          {bag.merchantName || `Merchant ${bag.merchantId}`}
                        </p>

                        {isLoading && (
                          <div
                            className="checkout__bag-loading"
                            aria-label="Loading shipping methods…"
                          >
                            <div className="checkout__bag-loading-item" />
                            <div className="checkout__bag-loading-item" />
                          </div>
                        )}

                        {!isLoading && error && (
                          <div className="checkout__bag-error" role="alert">
                            <span>{error}</span>
                            <button
                              type="button"
                              className="checkout__bag-error-retry"
                              onClick={() => handleRetryBag(bag.id)}
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {!isLoading && !error && bagMethods && (
                          <div role="group" aria-label={`Shipping options for ${bag.merchantName}`}>
                            {bagMethods.shippingMethods.length === 1 && (
                              <p
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--color-steel)",
                                  marginBottom: "0.5rem",
                                }}
                              >
                                Only one shipping option available — auto-selected.
                              </p>
                            )}
                            {bagMethods.shippingMethods.map((method) => {
                              const isSelected = selectedMethods[bag.id] === method.id;
                              return (
                                <div
                                  key={method.id}
                                  className={`checkout__method-option${isSelected ? " checkout__method-option--selected" : ""}`}
                                >
                                  <label className="checkout__method-label">
                                    <input
                                      type="radio"
                                      name={`shipping-${bag.id}`}
                                      value={method.id}
                                      checked={isSelected}
                                      onChange={() =>
                                        setSelectedMethods((prev) => ({
                                          ...prev,
                                          [bag.id]: method.id,
                                        }))
                                      }
                                    />
                                    <span className="checkout__method-info">
                                      <span className="checkout__method-name">{method.label}</span>
                                      {(method.minDays !== undefined ||
                                        method.carrier !== undefined) && (
                                        <span className="checkout__method-delivery">
                                          {method.carrier && `${method.carrier} · `}
                                          {method.minDays !== undefined &&
                                          method.maxDays !== undefined
                                            ? `${method.minDays}–${method.maxDays} days`
                                            : method.minDays !== undefined
                                              ? `${method.minDays}+ days`
                                              : ""}
                                        </span>
                                      )}
                                    </span>
                                    <span className="checkout__method-price">
                                      {method.price === 0 ? "FREE" : formatPrice(method.price)}
                                    </span>
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {shippingError && (
                  <p className="checkout__field-error" role="alert" style={{ marginTop: "1rem" }}>
                    {shippingError}
                  </p>
                )}

                {/* Show confirmed state or Continue button */}
                {step !== "methods" && (
                  <p
                    style={{
                      marginTop: "1rem",
                      color: "var(--color-success)",
                      fontWeight: 500,
                      fontSize: "0.875rem",
                    }}
                  >
                    ✓ Shipping confirmed.
                  </p>
                )}

                {step === "methods" && (
                  <button
                    type="button"
                    className={`checkout__submit${!allBagsSelected ? " checkout__submit--disabled" : ""}`}
                    style={{ marginTop: "1.5rem" }}
                    disabled={!allBagsSelected || isSubmittingShipping}
                    onClick={handleContinueToPayment}
                    aria-disabled={!allBagsSelected}
                  >
                    {isSubmittingShipping ? "Confirming shipping…" : "Continue to Payment"}
                  </button>
                )}
              </section>
            )}

            {/* ── Section 3: Guest info (Story 4.4) ── */}
            {(step === "guestInfo" || step === "billing" || step === "payment") && (
              <section
                className="checkout__section checkout__customer"
                aria-labelledby="checkout-guest-title"
              >
                <h2 className="checkout__section-title" id="checkout-guest-title">
                  Contact Information
                </h2>

                <form onSubmit={handleGuestInfoSubmit} noValidate>
                  <div className="checkout__field">
                    <label className="checkout__field-label" htmlFor="guest-email">
                      Email
                    </label>
                    <input
                      id="guest-email"
                      className="checkout__field-input"
                      type="email"
                      value={guestInfo.email}
                      onChange={(e) => setGuestInfo((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      disabled={step !== "guestInfo"}
                    />
                  </div>

                  <div className="checkout__field-row">
                    <div className="checkout__field">
                      <label className="checkout__field-label" htmlFor="guest-first">
                        First Name
                      </label>
                      <input
                        id="guest-first"
                        className="checkout__field-input"
                        type="text"
                        value={guestInfo.firstName}
                        onChange={(e) =>
                          setGuestInfo((prev) => ({ ...prev, firstName: e.target.value }))
                        }
                        autoComplete="given-name"
                        required
                        disabled={step !== "guestInfo"}
                      />
                    </div>
                    <div className="checkout__field">
                      <label className="checkout__field-label" htmlFor="guest-last">
                        Last Name
                      </label>
                      <input
                        id="guest-last"
                        className="checkout__field-input"
                        type="text"
                        value={guestInfo.lastName}
                        onChange={(e) =>
                          setGuestInfo((prev) => ({ ...prev, lastName: e.target.value }))
                        }
                        autoComplete="family-name"
                        required
                        disabled={step !== "guestInfo"}
                      />
                    </div>
                  </div>

                  {/* Marketing consent — unchecked by default per FR20 / UX spec */}
                  <label className="checkout__consent">
                    <input
                      type="checkbox"
                      checked={guestInfo.marketingConsent ?? false}
                      onChange={(e) =>
                        setGuestInfo((prev) => ({ ...prev, marketingConsent: e.target.checked }))
                      }
                      disabled={step !== "guestInfo"}
                    />
                    <span>Receive updates and offers from merchants</span>
                  </label>

                  {guestError && (
                    <p className="checkout__field-error" role="alert" style={{ marginTop: "1rem" }}>
                      {guestError}
                    </p>
                  )}

                  {step === "guestInfo" && (
                    <button
                      type="submit"
                      className="checkout__address-submit"
                      disabled={isGuestSubmitting}
                    >
                      {isGuestSubmitting ? "Saving…" : "Continue →"}
                    </button>
                  )}
                </form>

                {step !== "guestInfo" && (
                  <p
                    style={{ fontSize: "0.875rem", color: "var(--color-steel)", marginTop: "1rem" }}
                  >
                    {guestInfo.email} · {guestInfo.firstName} {guestInfo.lastName}
                  </p>
                )}
              </section>
            )}

            {/* ── Section 4: Billing address (Story 4.4) ── */}
            {(step === "billing" || step === "payment") && (
              <section
                className="checkout__section checkout__billing"
                aria-labelledby="checkout-billing-title"
              >
                <h2 className="checkout__section-title" id="checkout-billing-title">
                  Billing Address
                </h2>

                <form onSubmit={handleBillingConfirm} noValidate>
                  <label className="checkout__consent">
                    <input
                      type="checkbox"
                      checked={billingSameAsShipping}
                      onChange={(e) => setBillingSameAsShipping(e.target.checked)}
                      disabled={step !== "billing"}
                    />
                    <span>Same as shipping address</span>
                  </label>

                  {!billingSameAsShipping && step === "billing" && (
                    <div style={{ marginTop: "1rem" }}>
                      <div className="checkout__field">
                        <label className="checkout__field-label" htmlFor="billing-address1">
                          Street Address
                        </label>
                        <input
                          id="billing-address1"
                          className="checkout__field-input"
                          type="text"
                          value={billingAddress.address1}
                          onChange={(e) =>
                            setBillingAddress((p) => ({ ...p, address1: e.target.value }))
                          }
                          autoComplete="billing street-address"
                        />
                      </div>

                      <div className="checkout__field-row checkout__field-row--3col">
                        <div className="checkout__field">
                          <label className="checkout__field-label" htmlFor="billing-city">
                            City
                          </label>
                          <input
                            id="billing-city"
                            className="checkout__field-input"
                            type="text"
                            value={billingAddress.city}
                            onChange={(e) =>
                              setBillingAddress((p) => ({ ...p, city: e.target.value }))
                            }
                            autoComplete="billing address-level2"
                          />
                        </div>
                        <div className="checkout__field">
                          <label className="checkout__field-label" htmlFor="billing-state">
                            State
                          </label>
                          <input
                            id="billing-state"
                            className="checkout__field-input"
                            type="text"
                            value={billingAddress.state}
                            onChange={(e) =>
                              setBillingAddress((p) => ({ ...p, state: e.target.value }))
                            }
                            autoComplete="billing address-level1"
                          />
                        </div>
                        <div className="checkout__field">
                          <label className="checkout__field-label" htmlFor="billing-postal">
                            ZIP / Postal
                          </label>
                          <input
                            id="billing-postal"
                            className="checkout__field-input"
                            type="text"
                            value={billingAddress.postalCode}
                            onChange={(e) =>
                              setBillingAddress((p) => ({ ...p, postalCode: e.target.value }))
                            }
                            autoComplete="billing postal-code"
                          />
                        </div>
                      </div>

                      <div className="checkout__field">
                        <label className="checkout__field-label" htmlFor="billing-country">
                          Country
                        </label>
                        <select
                          id="billing-country"
                          className="checkout__field-select"
                          value={billingAddress.country}
                          onChange={(e) =>
                            setBillingAddress((p) => ({ ...p, country: e.target.value }))
                          }
                          autoComplete="billing country"
                        >
                          <option value="">Select a country…</option>
                          {SUPPORTED_COUNTRIES.map((code) => (
                            <option key={code} value={code}>
                              {COUNTRY_LABELS_MAP[code] ?? code}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {billingError && (
                    <p className="checkout__field-error" role="alert" style={{ marginTop: "1rem" }}>
                      {billingError}
                    </p>
                  )}
                  {paymentError && (
                    <p className="checkout__field-error" role="alert" style={{ marginTop: "1rem" }}>
                      {paymentError}
                    </p>
                  )}

                  {step === "billing" && (
                    <button
                      type="submit"
                      className="checkout__address-submit"
                      disabled={isBillingSubmitting}
                      style={{ marginTop: "1rem" }}
                    >
                      {isBillingSubmitting ? "Loading payment…" : "Continue to Payment →"}
                    </button>
                  )}
                </form>

                {step === "payment" && (
                  <p
                    style={{ fontSize: "0.875rem", color: "var(--color-steel)", marginTop: "1rem" }}
                  >
                    {billingSameAsShipping
                      ? "Same as shipping address"
                      : `${billingAddress.address1}, ${billingAddress.city}`}
                  </p>
                )}
              </section>
            )}

            {/* ── Section 5: Stripe payment (Story 4.4 + Apple/Google Pay Checkout) ── */}
            {step === "payment" && clientSecret && stripePromise && (
              <section
                className="checkout__section checkout__payment"
                aria-labelledby="checkout-payment-title"
              >
                <h2 className="checkout__section-title" id="checkout-payment-title">
                  Payment
                </h2>

                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: { theme: "flat" },
                  }}
                >
                  {/* Apple Pay / Google Pay Checkout — full sheet with address/shipping/payment */}
                  {/* Only renders if wallet payment is available on this device/browser */}
                  <WalletCheckoutForm
                    clientSecret={clientSecret}
                    appOrderId={appOrderIdRef.current}
                    violetCartId={violetCartId!}
                    cartTotal={cart?.total ?? 0}
                    currency={cart?.currency ?? "usd"}
                    onSuccess={handleOrderSuccess}
                  />

                  {/* Divider — only shown when wallet button is present */}
                  <div
                    className="checkout__wallet-divider"
                    role="separator"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      margin: "1.5rem 0",
                      color: "var(--color-steel, #999)",
                      fontSize: "0.75rem",
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        height: "1px",
                        background: "var(--color-border, #ddd)",
                      }}
                    />
                    <span style={{ padding: "0 1rem" }}>or pay with card</span>
                    <span
                      style={{
                        flex: 1,
                        height: "1px",
                        background: "var(--color-border, #ddd)",
                      }}
                    />
                  </div>

                  {/* Standard card payment form */}
                  <PaymentForm
                    appOrderId={appOrderIdRef.current}
                    violetCartId={violetCartId!}
                    onSuccess={handleOrderSuccess}
                    onPreSubmitValidation={validateInventoryBeforeSubmit}
                  />
                </Elements>
              </section>
            )}
          </div>

          {/* ── Right: Order summary sidebar ── */}
          <aside className="checkout__summary" aria-label="Order summary">
            <h2 className="checkout__summary-title">Order Summary</h2>

            {cart.bags.map((bag) => (
              <div key={bag.id}>
                {bag.items.map((item) => (
                  <div key={item.skuId} className="checkout__summary-item">
                    {item.thumbnailUrl && (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="checkout__summary-item-img"
                        aria-hidden="true"
                      />
                    )}
                    <div className="checkout__summary-item-info">
                      <p className="checkout__summary-item-name">
                        {item.name ?? `SKU ${item.skuId}`}
                      </p>
                      <p className="checkout__summary-item-qty">Qty: {item.quantity}</p>
                    </div>
                    <span className="checkout__summary-item-price">
                      {formatPrice(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}

                {/* Story 4.7: Per-bag errors from Violet 200-with-errors */}
                <BagErrors
                  errors={bag.errors}
                  items={bag.items}
                  merchantName={bag.merchantName}
                  onRemoveItem={handleRemoveItem}
                  onUpdateQuantity={handleUpdateQuantity}
                />
              </div>
            ))}

            <div className="checkout__summary-totals">
              <div className="checkout__summary-line">
                <span>Subtotal</span>
                <span>{formatPrice(subtotalAll)}</span>
              </div>
              {discountAll > 0 && (
                <div className="checkout__summary-line checkout__summary-line--discount">
                  <span>Discount</span>
                  <span>-{formatPrice(discountAll)}</span>
                </div>
              )}
              <div className="checkout__summary-line">
                <span>Est. Shipping</span>
                <span>{shippingAll > 0 ? formatPrice(shippingAll) : "—"}</span>
              </div>
              <div className="checkout__summary-line">
                <span>Est. Tax</span>
                <span>{taxAll > 0 ? formatPrice(taxAll) : "—"}</span>
              </div>
              <div className="checkout__summary-line checkout__summary-line--total">
                <span>Total</span>
                <span>{formatPrice(totalAll)}</span>
              </div>
            </div>

            {/* Promo code input */}
            <form onSubmit={handleApplyPromo} className="checkout__promo">
              <label className="checkout__promo-label" htmlFor="promo-code">
                Promo Code
              </label>
              <div className="checkout__promo-row">
                <input
                  id="promo-code"
                  className="checkout__promo-input"
                  type="text"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    if (promoError) setPromoError(null);
                  }}
                  placeholder="Enter code"
                  autoComplete="off"
                  disabled={isPromoSubmitting}
                />
                <button
                  type="submit"
                  className="checkout__promo-btn"
                  disabled={!promoCode.trim() || isPromoSubmitting}
                >
                  {isPromoSubmitting ? "Applying…" : "Apply"}
                </button>
              </div>
              {promoError && (
                <p className="checkout__field-error" role="alert" style={{ marginTop: "0.5rem" }}>
                  {promoError}
                </p>
              )}
            </form>

            {/* Applied discounts */}
            {allDiscounts.length > 0 && (
              <div className="checkout__discounts">
                {allDiscounts.map((d) => {
                  const display = getDiscountDisplay(d.status);
                  return (
                    <div key={d.id} className="checkout__discount-tag">
                      <span className="checkout__discount-code">{d.code}</span>
                      {d.status === "APPLIED" && d.amountTotal != null && (
                        <span className="checkout__discount-amount">
                          -{formatPrice(d.amountTotal)}
                        </span>
                      )}
                      {display.variant === "muted" && (
                        <span className="checkout__discount-status">{display.label}</span>
                      )}
                      {display.variant === "danger" && (
                        <span className="checkout__discount-status checkout__discount-status--invalid">
                          {display.label}
                        </span>
                      )}
                      <button
                        type="button"
                        className="checkout__discount-remove"
                        onClick={() => handleRemoveDiscount(d.id)}
                        aria-label={`Remove discount ${d.code}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="checkout__affiliate">
              We earn a commission on purchases — this doesn&apos;t affect your price.
            </p>

            {/* Cross-border duty warning — B1 */}
            {cart.bags.some(
              (bag) =>
                bag.merchantCountryCode &&
                address.country &&
                bag.merchantCountryCode !== address.country,
            ) && (
              <div className="checkout__cross-border-warning" role="alert">
                <svg
                  className="checkout__cross-border-warning-icon"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width="20"
                  height="20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="checkout__cross-border-warning-text">
                  <strong>International Order</strong>
                  <p>
                    Customs duties and import fees may apply. You are responsible for any additional
                    charges upon delivery.
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
