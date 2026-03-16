import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useCartContext } from "../../contexts/CartContext";
import { useCartQuery, queryKeys, formatPrice } from "@ecommerce/shared";
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
  setCustomerFn,
  setBillingAddressFn,
  getPaymentIntentFn,
  submitOrderFn,
  clearCartCookieFn,
} from "../../server/checkout";
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

export const Route = createFileRoute("/checkout/")({
  component: CheckoutPageWithBoundary,
});

const fetchCart: CartFetchFn = (violetCartId) => getCartFn({ data: violetCartId });

/**
 * Stripe instance — loaded once at module level to prevent re-initialization.
 *
 * `loadStripe()` returns a Promise that resolves to a Stripe object. Calling it
 * multiple times (inside a component) would reload the Stripe SDK on every render.
 * Module-level ensures single initialization.
 *
 * Uses `VITE_STRIPE_PUBLISHABLE_KEY` (Vite exposes `VITE_` prefixed env vars
 * to the client). This is the Stripe publishable key (pk_test_... or pk_live_...),
 * safe for client-side use.
 *
 * @see https://stripe.com/docs/stripe-js/react#elements-provider
 */
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "");

/**
 * Countries supported by Violet's Stripe platform account (US/UK/EU).
 * Used for a client-side warning — Violet enforces the real restriction server-side.
 */
const SUPPORTED_COUNTRIES = [
  "US",
  "GB",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "BE",
  "AT",
  "PT",
  "FI",
  "SE",
  "DK",
  "NO",
  "IE",
  "PL",
  "CZ",
  "SK",
  "HU",
  "RO",
];

const EU_COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  BE: "Belgium",
  AT: "Austria",
  PT: "Portugal",
  FI: "Finland",
  SE: "Sweden",
  DK: "Denmark",
  NO: "Norway",
  IE: "Ireland",
  PL: "Poland",
  CZ: "Czech Republic",
  SK: "Slovakia",
  HU: "Hungary",
  RO: "Romania",
};

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
}

interface AddressFormErrors {
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
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
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const cartCheck = await getCartFn({ data: violetCartId });
          if (cartCheck.data?.status === "completed") {
            onSuccess(cartCheck.data.id);
            return;
          }
        }
        setSubmitError(
          "Your order may have been placed. Please check your email for confirmation before trying again.",
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

    // Success — COMPLETED status
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
      <PaymentElement />

      {submitError && (
        <p className="checkout__field-error" role="alert" style={{ marginTop: "1rem" }}>
          {submitError}
        </p>
      )}

      <button
        type="submit"
        className={`checkout__submit checkout__submit--place-order${isSubmitting ? " checkout__submit--loading" : ""}`}
        disabled={isSubmitting || !stripe || !elements}
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

// ─── CheckoutPage ─────────────────────────────────────────────────────────

function CheckoutPage() {
  const { violetCartId, cartHealth, setCartHealth, resetCart } = useCartContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: cartResponse, isLoading: isCartLoading } = useCartQuery(violetCartId, fetchCart);
  const cart = cartResponse?.data ?? null;

  // ── Checkout flow step ──────────────────────────────────────────────
  const [step, setStep] = useState<CheckoutStep>("address");

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
   * Wraps a Server Function call with timeout detection and retry prompt wiring.
   *
   * ## Why this exists (Code Review Fix — H2)
   * The original implementation created the RetryPrompt component and state but never
   * triggered it. No Server Function call had timeout detection, making the retry UX
   * dead code. This helper:
   * 1. Races the Server Function against a timeout (default 30s — Violet's max response time)
   * 2. On timeout: shows the RetryPrompt overlay (user-initiated retry, NOT automatic)
   * 3. Preserves all form state (the caller's local state is untouched)
   * 4. Returns the server result on success, or null on timeout (caller checks retryState)
   *
   * @param operationName - Human-readable label for the retry prompt (e.g., "saving your address")
   * @param serverCall - The Server Function call (async)
   * @param onCancel - Called when user cancels from retry prompt (e.g., go back to previous step)
   * @param timeoutMs - Timeout in milliseconds (default 30000)
   * @returns The server result, or `null` if timed out (retry prompt is now showing)
   */
  const withTimeoutRetry = useCallback(
    async <T,>(
      operationName: string,
      serverCall: () => Promise<T>,
      onCancel: () => void,
      timeoutMs = 30000,
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

  // ── Story 4.7: Item action handlers for error components ────────────
  const handleRemoveItem = useCallback(
    async (skuId: string) => {
      if (!violetCartId) return;
      await removeFromCartFn({ data: { violetCartId, skuId } });
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    [violetCartId, queryClient],
  );

  const handleUpdateQuantity = useCallback(
    async (skuId: string, quantity: number) => {
      if (!violetCartId) return;
      await updateCartItemFn({ data: { violetCartId, skuId, quantity } });
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    [violetCartId, queryClient],
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
  const [address, setAddress] = useState<AddressFormState>({
    address1: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });
  const [addressErrors, setAddressErrors] = useState<AddressFormErrors>({});
  const [isAddressSubmitting, setIsAddressSubmitting] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // ── Shipping methods ────────────────────────────────────────────────
  const [availableMethods, setAvailableMethods] = useState<ShippingMethodsAvailable[]>([]);
  const [bagLoadingState, setBagLoadingState] = useState<Record<string, boolean>>({});
  const [bagErrorState, setBagErrorState] = useState<Record<string, string>>({});
  const [selectedMethods, setSelectedMethods] = useState<Record<string, string>>({});

  // ── Continue to payment ─────────────────────────────────────────────
  const [isSubmittingShipping, setIsSubmittingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  // ── Guest info (Story 4.4) ──────────────────────────────────────────
  const [guestInfo, setGuestInfo] = useState<CustomerInput>({
    email: "",
    firstName: "",
    lastName: "",
    marketingConsent: false,
  });
  const [guestError, setGuestError] = useState<string | null>(null);
  const [isGuestSubmitting, setIsGuestSubmitting] = useState(false);

  // ── Billing address (Story 4.4) ─────────────────────────────────────
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [billingAddress, setBillingAddress] = useState<AddressFormState>({
    address1: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });
  const [billingError, setBillingError] = useState<string | null>(null);
  const [isBillingSubmitting, setIsBillingSubmitting] = useState(false);

  // ── Stripe payment (Story 4.4) ──────────────────────────────────────
  const [clientSecret, setClientSecret] = useState<string | null>(null);
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
    if (!address.postalCode.trim()) errors.postalCode = "Postal code is required";
    if (!address.country) errors.country = "Country is required";
    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Fetch available methods ─────────────────────────────────────────
  async function fetchAvailableShippingMethods() {
    if (!cart) return;

    const loadingMap: Record<string, boolean> = {};
    cart.bags.forEach((b) => (loadingMap[b.id] = true));
    setBagLoadingState(loadingMap);
    setBagErrorState({});

    const result = await getAvailableShippingMethodsFn();

    if (result.error) {
      const errorMap: Record<string, string> = {};
      cart.bags.forEach((b) => (errorMap[b.id] = result.error!.message));
      setBagErrorState(errorMap);
      setBagLoadingState({});
      return;
    }

    const methods = result.data ?? [];
    setAvailableMethods(methods);
    setBagLoadingState({});

    const errorMap: Record<string, string> = {};
    cart.bags.forEach((b) => {
      const found = methods.find((m) => m.bagId === b.id);
      if (!found || found.shippingMethods.length === 0) {
        errorMap[b.id] = "No shipping methods available for this merchant.";
      }
    });
    setBagErrorState(errorMap);

    // Auto-select if a bag has only one shipping option (AC#7)
    const autoSelections: Record<string, string> = {};
    for (const bagMethods of methods) {
      if (bagMethods.shippingMethods.length === 1) {
        autoSelections[bagMethods.bagId] = bagMethods.shippingMethods[0].id;
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

    // If different billing address, send it to Violet
    if (!billingSameAsShipping) {
      if (
        !billingAddress.address1.trim() ||
        !billingAddress.city.trim() ||
        !billingAddress.state.trim() ||
        !billingAddress.postalCode.trim() ||
        !billingAddress.country
      ) {
        setBillingError("All billing address fields are required.");
        setIsBillingSubmitting(false);
        return;
      }

      const billingResult = await setBillingAddressFn({
        data: {
          address1: billingAddress.address1,
          city: billingAddress.city,
          state: billingAddress.state,
          postalCode: billingAddress.postalCode,
          country: billingAddress.country,
        },
      });

      if (billingResult.error) {
        setBillingError(billingResult.error.message);
        setIsBillingSubmitting(false);
        return;
      }
    }

    // Fetch PaymentIntent client secret from Violet (GET /cart → extract secret)
    setPaymentError(null);
    const piResult = await getPaymentIntentFn();

    if (piResult.error) {
      setPaymentError(piResult.error.message);
      setIsBillingSubmitting(false);
      return;
    }

    setClientSecret(piResult.data!.clientSecret);
    setStep("payment");
    setIsBillingSubmitting(false);
  }

  // ── Order success handler ───────────────────────────────────────────
  async function handleOrderSuccess(orderId: string) {
    // Clear cart cookie so next addToCart creates a fresh cart
    await clearCartCookieFn();

    // Clear cart state so CartDrawer shows empty
    if (violetCartId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.cart.detail(violetCartId) });
    }

    // Navigate to order confirmation page (Story 4.5 — full UI with order details)
    navigate({ to: `/order/${orderId}/confirmation` as string });
  }

  // ── Aggregate totals ───────────────────────────────────────────────
  const subtotalAll = cart?.bags.reduce((sum, b) => sum + b.subtotal, 0) ?? 0;
  const taxAll = cart?.bags.reduce((sum, b) => sum + b.tax, 0) ?? 0;
  const shippingAll = cart?.bags.reduce((sum, b) => sum + b.shippingTotal, 0) ?? 0;
  const totalAll = subtotalAll + taxAll + shippingAll;

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
                        {EU_COUNTRY_LABELS[code] ?? code}
                      </option>
                    ))}
                  </select>
                  {addressErrors.country && (
                    <p className="checkout__field-error">{addressErrors.country}</p>
                  )}
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
                  {EU_COUNTRY_LABELS[address.country] ?? address.country}
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
                  {cart.bags.map((bag) => {
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
                              {EU_COUNTRY_LABELS[code] ?? code}
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

            {/* ── Section 5: Stripe payment (Story 4.4) ── */}
            {step === "payment" && clientSecret && (
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

            <p className="checkout__affiliate">
              We earn a commission on purchases — this doesn&apos;t affect your price.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
