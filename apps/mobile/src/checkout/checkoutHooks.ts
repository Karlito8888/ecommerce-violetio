/**
 * Per-step checkout hooks — encapsulate mutation logic and validation.
 *
 * Each hook manages the API call for its step, dispatching the appropriate
 * reducer actions. Components consume these hooks for a clean separation of
 * concerns: UI renders state, hooks handle side effects.
 *
 * ## Pattern
 * Each hook receives `dispatch` + cart ID and returns:
 * - A `submit()` function that validates → dispatches start → calls API → dispatches result
 * - Step-specific helpers (e.g., `selectMethod`, `updateAddress`)
 *
 * @see checkoutReducer.ts — state machine definition
 * @see getCheckout.ts — API fetch functions
 */

import { useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import {
  COUNTRIES_WITHOUT_POSTAL_CODE,
  BLOCKED_ADDRESS_USER_MESSAGE,
  ORDER_STATUS_MESSAGES,
  getSupportedCountries,
} from "@ecommerce/shared";
import type { CheckoutState, CheckoutAction, AddressFields } from "../checkout/checkoutReducer";
import {
  setShippingAddress,
  getAvailableShippingMethods,
  setShippingMethods,
  setCustomerInfo,
  setBillingAddress,
  getPaymentIntent,
  submitOrder,
  priceCart,
  addDiscount,
  removeDiscount,
} from "../server/getCheckout";
import { CART_STORAGE_KEY } from "../constants/cart";
import { fetchCartMobile } from "../server/getCart";

/** Resolves the Violet cart ID from SecureStore.
 * Returns null if not found — caller should show an appropriate error.
 */
async function resolveCartId(): Promise<string | null> {
  return SecureStore.getItemAsync(CART_STORAGE_KEY);
}

/** Supported country codes based on the current platform country. */
const PLATFORM_COUNTRY = process.env.EXPO_PUBLIC_STRIPE_ACCOUNT_COUNTRY ?? "US";
const SUPPORTED_COUNTRIES = getSupportedCountries(PLATFORM_COUNTRY);

// ─── Address Step ────────────────────────────────────────────────────────────

export function useAddressStep(state: CheckoutState, dispatch: React.Dispatch<CheckoutAction>) {
  const updateAddress = useCallback(
    (fields: Partial<AddressFields>) => {
      dispatch({ type: "UPDATE_ADDRESS", address: fields });
    },
    [dispatch],
  );

  const submit = useCallback(async () => {
    const { address } = state;

    // Validate required fields
    const postalCodeRequired = !COUNTRIES_WITHOUT_POSTAL_CODE.has(address.country);
    if (
      !address.address1.trim() ||
      !address.city.trim() ||
      !address.state.trim() ||
      (postalCodeRequired && !address.postalCode.trim()) ||
      !address.country.trim()
    ) {
      dispatch({ type: "ADDRESS_SUBMIT_ERROR", error: "All address fields are required." });
      return;
    }

    // Validate country is supported for shipping (matches web dropdown constraint)
    if (!SUPPORTED_COUNTRIES.includes(address.country)) {
      dispatch({
        type: "ADDRESS_SUBMIT_ERROR",
        error: `We don't ship to ${address.country}. Please select a supported country.`,
      });
      return;
    }

    const cartId = await resolveCartId();
    if (!cartId) {
      dispatch({
        type: "ADDRESS_SUBMIT_ERROR",
        error: "No active cart found. Please add items to your cart first.",
      });
      return;
    }

    dispatch({ type: "ADDRESS_SUBMIT_START" });

    try {
      const body: Parameters<typeof setShippingAddress>[1] = {
        address_1: address.address1,
        city: address.city,
        state: address.state,
        postal_code: address.postalCode,
        country: address.country,
      };
      if (address.phone.trim()) {
        body.phone = address.phone.trim();
      }

      const json = await setShippingAddress(cartId, body);

      if (json.error) {
        const errMsg = json.error.message ?? "";
        if (
          errMsg.includes("blocked_address") ||
          errMsg.includes("blocked due to a history") ||
          json.error.code === "VIOLET.BLOCKED_ADDRESS"
        ) {
          dispatch({ type: "ADDRESS_SUBMIT_ERROR", error: BLOCKED_ADDRESS_USER_MESSAGE });
        } else {
          dispatch({ type: "ADDRESS_SUBMIT_ERROR", error: errMsg });
        }
        return;
      }

      dispatch({ type: "ADDRESS_SUBMIT_SUCCESS" });

      // Check if all bags are digital — if so, skip shipping entirely.
      // Mirrors web: if (cart?.allBagsDigital) { setStep("guestInfo"); return; }
      // @see https://docs.violet.io/prism/catalog/skus — Digital Product Delivery
      try {
        const cartResult = await fetchCartMobile(cartId);
        if (cartResult.data?.allBagsDigital) {
          dispatch({ type: "DIGITAL_SKIP_SHIPPING" });
          return;
        }
      } catch {
        // If cart fetch fails, proceed with shipping methods — safe fallback
      }

      // Fetch shipping methods for physical bags
      dispatch({ type: "SHIPPING_METHODS_FETCH_START" });

      try {
        const methodsJson = await getAvailableShippingMethods(cartId);

        if (methodsJson.error) {
          dispatch({
            type: "SHIPPING_METHODS_FETCH_ERROR",
            error: methodsJson.error.message ?? "Failed to load shipping options",
          });
          return;
        }

        const methods = methodsJson.data ?? [];
        const bagErrors: Record<string, string> = {};
        for (const bag of methods) {
          if (bag.shippingMethods.length === 0) {
            bagErrors[bag.bagId] = "No shipping methods available for this merchant.";
          }
        }

        // Auto-select bags with only one shipping option (AC#7)
        const autoSelections: Record<string, string> = {};
        for (const bag of methods) {
          if (bag.shippingMethods.length === 1) {
            autoSelections[bag.bagId] = bag.shippingMethods[0].id;
          }
        }

        dispatch({
          type: "SHIPPING_METHODS_FETCH_SUCCESS",
          methods,
          bagErrors,
          autoSelections,
        });
      } catch {
        dispatch({
          type: "SHIPPING_METHODS_FETCH_ERROR",
          error: "Network error loading shipping options. Please try again.",
        });
      }
    } catch {
      dispatch({
        type: "ADDRESS_SUBMIT_ERROR",
        error: "Network error. Please check your connection and try again.",
      });
    }
  }, [state.address, dispatch]);

  return { updateAddress, submit };
}

// ─── Shipping Step ───────────────────────────────────────────────────────────

export function useShippingStep(state: CheckoutState, dispatch: React.Dispatch<CheckoutAction>) {
  const { shipping } = state;

  const allBagsSelected =
    state.allBagsDigital ||
    (shipping.availableMethods.length > 0 &&
      shipping.availableMethods.every((bag) => Boolean(shipping.selectedMethods[bag.bagId])));

  const selectMethod = useCallback(
    (bagId: string, methodId: string) => {
      dispatch({ type: "SELECT_SHIPPING_METHOD", bagId, methodId });
    },
    [dispatch],
  );

  const retryFetch = useCallback(async () => {
    const cartId = await resolveCartId();
    if (!cartId) return;

    dispatch({ type: "SHIPPING_METHODS_FETCH_START" });
    try {
      const json = await getAvailableShippingMethods(cartId);
      if (json.error) {
        dispatch({
          type: "SHIPPING_METHODS_FETCH_ERROR",
          error: json.error.message ?? "Failed to load shipping options",
        });
        return;
      }
      const methods = json.data ?? [];
      const bagErrors: Record<string, string> = {};
      for (const bag of methods) {
        if (bag.shippingMethods.length === 0) {
          bagErrors[bag.bagId] = "No shipping methods available for this merchant.";
        }
      }
      const autoSelections: Record<string, string> = {};
      for (const bag of methods) {
        if (bag.shippingMethods.length === 1) {
          autoSelections[bag.bagId] = bag.shippingMethods[0].id;
        }
      }
      dispatch({ type: "SHIPPING_METHODS_FETCH_SUCCESS", methods, bagErrors, autoSelections });
    } catch {
      dispatch({
        type: "SHIPPING_METHODS_FETCH_ERROR",
        error: "Network error loading shipping options. Please try again.",
      });
    }
  }, [dispatch]);

  const submit = useCallback(async () => {
    if (!allBagsSelected) return;

    // If all bags are digital, shipping was already skipped via DIGITAL_SKIP_SHIPPING.
    // This submit should never be called in that case, but guard defensively.
    if (state.allBagsDigital) return;

    const cartId = await resolveCartId();
    if (!cartId) {
      dispatch({
        type: "SHIPPING_SUBMIT_ERROR",
        error: "Cart session expired. Please return to your cart.",
      });
      return;
    }

    dispatch({ type: "SHIPPING_SUBMIT_START" });

    try {
      const selections = Object.entries(shipping.selectedMethods).map(
        ([bagId, shippingMethodId]) => ({
          bag_id: Number(bagId),
          shipping_method_id: shippingMethodId,
        }),
      );

      const json = await setShippingMethods(cartId, selections);

      if (json.error) {
        dispatch({
          type: "SHIPPING_SUBMIT_ERROR",
          error: json.error.message ?? "Failed to confirm shipping",
        });
        return;
      }

      // Price Cart — tax_total check per Violet docs.
      // "When building your own integration, there are instances where carts are
      // not priced automatically after applying shipping methods. You will know
      // this is needed when the response from the apply shipping methods call has
      // a 0 value for tax_total. If that happens, make a call to price cart before
      // calling submit."
      //
      // We call priceCart non-blockingly after every shipping submit.
      // It's a GET (idempotent) that returns the priced cart. If pricing already
      // happened, it's a no-op server-side. This avoids needing the full cart
      // response from setShippingMethods to check bag.tax === 0.
      //
      // @see https://docs.violet.io/api-reference/orders-and-checkout/cart-pricing/price-cart
      // @see https://docs.violet.io/prism/overview/place-an-order/submit-cart
      try {
        await priceCart(cartId);
      } catch {
        // Non-fatal: pricing may succeed at submit time. Don't block checkout.
      }

      dispatch({ type: "SHIPPING_SUBMIT_SUCCESS" });
    } catch {
      dispatch({
        type: "SHIPPING_SUBMIT_ERROR",
        error: "Network error. Please try again.",
      });
    }
  }, [allBagsSelected, shipping.selectedMethods, dispatch]);

  return { allBagsSelected, selectMethod, retryFetch, submit };
}

// ─── Guest Info Step ─────────────────────────────────────────────────────────

export function useGuestInfoStep(state: CheckoutState, dispatch: React.Dispatch<CheckoutAction>) {
  const update = useCallback(
    (
      fields: Partial<
        Pick<typeof state.guest, "email" | "firstName" | "lastName" | "marketingConsent">
      >,
    ) => {
      dispatch({ type: "GUEST_UPDATE", fields });
    },
    [dispatch],
  );

  const submit = useCallback(async () => {
    const { email, firstName, lastName, marketingConsent } = state.guest;

    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      dispatch({
        type: "GUEST_SUBMIT_ERROR",
        error: "Email, first name, and last name are required.",
      });
      return;
    }

    const cartId = await resolveCartId();
    if (!cartId) {
      dispatch({
        type: "GUEST_SUBMIT_ERROR",
        error: "Cart session expired. Please return to your cart.",
      });
      return;
    }

    dispatch({ type: "GUEST_SUBMIT_START" });

    try {
      const customerBody: Parameters<typeof setCustomerInfo>[1] = {
        email,
        first_name: firstName,
        last_name: lastName,
      };
      if (marketingConsent) {
        customerBody.communication_preferences = [{ enabled: true }];
      }

      const json = await setCustomerInfo(cartId, customerBody);

      if (json.error) {
        dispatch({
          type: "GUEST_SUBMIT_ERROR",
          error: json.error.message ?? "Failed to save customer info",
        });
        return;
      }

      dispatch({ type: "GUEST_SUBMIT_SUCCESS" });
    } catch {
      dispatch({
        type: "GUEST_SUBMIT_ERROR",
        error: "Network error. Please try again.",
      });
    }
  }, [state.guest, dispatch]);

  return { update, submit };
}

// ─── Billing Step ────────────────────────────────────────────────────────────

export function useBillingStep(
  state: CheckoutState,
  dispatch: React.Dispatch<CheckoutAction>,
  initPaymentSheet: (options: {
    merchantDisplayName: string;
    paymentIntentClientSecret: string;
    allowsDelayedPaymentMethods: boolean;
    returnURL?: string;
    /** iOS only. Enable Apple Pay in the Payment Sheet. */
    applePay?: {
      merchantCountryCode: string;
    };
  }) => Promise<{ error?: { message?: string } | null }>,
  setStripePublishableKey: (key: string) => void,
) {
  const toggleSameAsShipping = useCallback(() => {
    dispatch({ type: "BILLING_TOGGLE_SAME_AS_SHIPPING" });
  }, [dispatch]);

  const updateAddress = useCallback(
    (fields: Partial<AddressFields>) => {
      dispatch({ type: "BILLING_UPDATE_ADDRESS", address: fields });
    },
    [dispatch],
  );

  const submit = useCallback(async () => {
    const { billing } = state;

    const cartId = await resolveCartId();
    if (!cartId) {
      dispatch({
        type: "BILLING_SUBMIT_ERROR",
        error: "Cart session expired. Please return to your cart.",
      });
      return;
    }

    dispatch({ type: "BILLING_SUBMIT_START" });

    try {
      // If different billing address, send to Violet
      if (!billing.sameAsShipping) {
        if (
          !billing.address.address1.trim() ||
          !billing.address.city.trim() ||
          !billing.address.state.trim() ||
          (!billing.address.postalCode.trim() &&
            !COUNTRIES_WITHOUT_POSTAL_CODE.has(billing.address.country)) ||
          !billing.address.country.trim()
        ) {
          dispatch({
            type: "BILLING_SUBMIT_ERROR",
            error: "All billing address fields are required.",
          });
          return;
        }

        // Validate billing country is supported (matches web dropdown constraint)
        if (!SUPPORTED_COUNTRIES.includes(billing.address.country)) {
          dispatch({
            type: "BILLING_SUBMIT_ERROR",
            error: `Billing country ${billing.address.country} is not supported. Please select a supported country.`,
          });
          return;
        }

        const billingJson = await setBillingAddress(cartId, {
          address_1: billing.address.address1,
          city: billing.address.city,
          state: billing.address.state,
          postal_code: billing.address.postalCode,
          country: billing.address.country,
        });

        if (billingJson.error) {
          dispatch({
            type: "BILLING_SUBMIT_ERROR",
            error: billingJson.error.message ?? "Failed to set billing address",
          });
          return;
        }
      }

      // Get payment intent (client secret + stripe key)
      const piJson = await getPaymentIntent(cartId);

      if (piJson.error || !piJson.data) {
        dispatch({
          type: "BILLING_SUBMIT_ERROR",
          error: piJson.error?.message ?? "Failed to load payment information.",
        });
        return;
      }

      const clientSecret = piJson.data.clientSecret;
      if (!clientSecret) {
        dispatch({
          type: "BILLING_SUBMIT_ERROR",
          error: "Payment not available. Cart may need to be recreated.",
        });
        return;
      }

      // Use the Stripe publishable key from Violet's cart response
      const violetStripeKey = piJson.data.stripePublishableKey;
      if (violetStripeKey) {
        setStripePublishableKey(violetStripeKey);
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: "Maison Émile",
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
        // "mobile" is the URL scheme from app.config.ts.
        // Required for 3DS1/bank redirects to auto-dismiss and return to the app.
        // @see https://docs.stripe.com/payments/accept-a-payment?platform=react-native
        returnURL: "mobile://stripe-redirect",
        // Enable Apple Pay in PaymentSheet on iOS.
        // merchantCountryCode = country code of the Stripe platform account (US sandbox / FR prod).
        // @see https://docs.stripe.com/apple-pay?platform=react-native — "Enable Apple Pay"
        // @see https://docs.stripe.com/payments/mobile/payment-sheet — "Optional: Enable Apple Pay"
        applePay: {
          merchantCountryCode: process.env.EXPO_PUBLIC_STRIPE_ACCOUNT_COUNTRY || "US",
        },
      });

      if (initError) {
        dispatch({
          type: "BILLING_SUBMIT_ERROR",
          error: `Payment setup failed: ${initError.message}`,
        });
        return;
      }

      dispatch({ type: "BILLING_SUBMIT_SUCCESS" });
    } catch {
      dispatch({
        type: "BILLING_SUBMIT_ERROR",
        error: "Network error. Please try again.",
      });
    }
  }, [state.billing, dispatch, initPaymentSheet, setStripePublishableKey]);

  return { toggleSameAsShipping, updateAddress, submit };
}

// ─── Payment Step ────────────────────────────────────────────────────────────

export function usePaymentStep(
  state: CheckoutState,
  dispatch: React.Dispatch<CheckoutAction>,
  presentPaymentSheet: () => Promise<{ error?: { code?: string; message?: string } | null }>,
  appOrderId: string,
  onSuccess: (orderId: string) => void,
) {
  const submit = useCallback(async () => {
    const cartId = await resolveCartId();
    if (!cartId) {
      dispatch({
        type: "PAYMENT_ERROR",
        error: "Cart session expired. Please return to your cart.",
      });
      return;
    }

    dispatch({ type: "PAYMENT_START" });

    try {
      const { error: sheetError } = await presentPaymentSheet();

      if (sheetError) {
        if (sheetError.code !== "Canceled") {
          dispatch({
            type: "PAYMENT_ERROR",
            error: sheetError.message ?? "Payment failed. Please try again.",
          });
        } else {
          dispatch({ type: "PAYMENT_CANCEL" });
        }
        return;
      }

      const submitJson = await submitOrder(cartId, appOrderId);

      if (submitJson.error) {
        // Lost confirmation polling (Story 4.7 AC#3).
        // When submit returns a network/timeout error (not a Violet business error),
        // the order may have actually been placed. Before showing an error, poll
        // the cart status to check if it transitioned to "completed".
        // Mirrors web: 5×2s polling via getCartFn().
        //
        // Uses the Violet cart ID (numeric) not appOrderId (UUID) — same as web.
        // @see checkout/index.tsx — identical pattern.
        const isNetworkError =
          submitJson.error.code === "VIOLET.API_ERROR" ||
          submitJson.error.message.toLowerCase().includes("timeout");

        if (isNetworkError) {
          for (let i = 0; i < 5; i++) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const cartCheck = await fetchCartMobile(cartId);
            if (cartCheck.data?.status === "completed") {
              // Order actually went through — clear cart and notify parent
              dispatch({ type: "PAYMENT_SUCCESS" });
              await SecureStore.deleteItemAsync(CART_STORAGE_KEY);
              onSuccess("");
              return;
            }
          }
          dispatch({
            type: "PAYMENT_ERROR",
            error: ORDER_STATUS_MESSAGES.LOST_CONFIRMATION,
          });
          return;
        }

        dispatch({
          type: "PAYMENT_ERROR",
          error:
            "Payment was authorized but order submission failed. Your card was not charged. Please try again or contact support.",
        });
        return;
      }

      const orderData = submitJson.data;

      if (orderData?.status === "REJECTED") {
        dispatch({
          type: "PAYMENT_ERROR",
          error: ORDER_STATUS_MESSAGES.REJECTED,
        });
        return;
      }

      if (orderData?.status === "REQUIRES_ACTION") {
        // REQUIRES_ACTION post-submit is rare on mobile — PaymentSheet handles
        // 3DS2 natively during presentPaymentSheet() (SCA-Ready). This edge case
        // occurs for legacy 3DS1 or bank redirects that the SDK couldn't process.
        // @see https://docs.stripe.com/payments/accept-a-payment?platform=react-native
        dispatch({
          type: "PAYMENT_ERROR",
          error:
            "Additional verification is required by your bank. Please check your banking app or email for instructions, then try again.",
        });
        return;
      }

      if (orderData?.status === "CANCELED") {
        dispatch({
          type: "PAYMENT_ERROR",
          error: ORDER_STATUS_MESSAGES.CANCELED,
        });
        return;
      }

      // Success — clear cart and notify parent
      dispatch({ type: "PAYMENT_SUCCESS" });
      await SecureStore.deleteItemAsync(CART_STORAGE_KEY);
      const orderId = String(orderData?.id ?? "");
      onSuccess(orderId);
    } catch {
      dispatch({
        type: "PAYMENT_ERROR",
        error: "Network error. Please try again.",
      });
    }
  }, [dispatch, presentPaymentSheet, appOrderId, onSuccess]);

  return { submit };
}

// ─── Discount Step ───────────────────────────────────────────────────────────

/**
 * Hook for discount/promo code management.
 *
 * @param bags - Cart bags from parent state (avoids extra fetchCartMobile call).
 *   The checkout page already has cart data — pass it in rather than re-fetching.
 */
export function useDiscountStep(
  state: CheckoutState,
  dispatch: React.Dispatch<CheckoutAction>,
  bags: import("@ecommerce/shared").Bag[],
) {
  const updatePromoCode = useCallback(
    (promoCode: string) => {
      dispatch({ type: "DISCOUNT_UPDATE_PROMO", promoCode });
    },
    [dispatch],
  );

  const applyPromo = useCallback(async () => {
    const code = state.discount.promoCode.trim();
    if (!code) return;

    if (bags.length === 0) {
      dispatch({ type: "DISCOUNT_APPLY_ERROR", error: "Cart is empty." });
      return;
    }

    const cartId = await resolveCartId();
    if (!cartId) {
      dispatch({ type: "DISCOUNT_APPLY_ERROR", error: "No active cart found." });
      return;
    }

    // Use the first bag's merchant (matches web behavior)
    const targetBag = bags[0];

    dispatch({ type: "DISCOUNT_APPLY_START" });

    try {
      // Use guest email if available (for customer-restricted discounts)
      const email = state.guest.email.trim() || undefined;

      const json = await addDiscount(cartId, {
        code,
        merchant_id: Number(targetBag.merchantId),
        ...(email ? { email } : {}),
      });

      if (json.error) {
        dispatch({
          type: "DISCOUNT_APPLY_ERROR",
          error: json.error.message ?? "Invalid promo code.",
        });
        return;
      }

      dispatch({ type: "DISCOUNT_APPLY_SUCCESS" });
    } catch {
      dispatch({ type: "DISCOUNT_APPLY_ERROR", error: "Network error. Please try again." });
    }
  }, [state.discount.promoCode, state.guest.email, bags, dispatch]);

  const removeDiscountCode = useCallback(
    async (discountId: string) => {
      const cartId = await resolveCartId();
      if (!cartId) {
        dispatch({ type: "DISCOUNT_REMOVE_ERROR", error: "No active cart found." });
        return;
      }

      dispatch({ type: "DISCOUNT_REMOVE_START", discountId });

      try {
        const json = await removeDiscount(cartId, discountId);

        if (json.error) {
          dispatch({
            type: "DISCOUNT_REMOVE_ERROR",
            error: json.error.message ?? "Failed to remove discount.",
          });
          return;
        }

        dispatch({ type: "DISCOUNT_REMOVE_SUCCESS" });
      } catch {
        dispatch({ type: "DISCOUNT_REMOVE_ERROR", error: "Network error. Please try again." });
      }
    },
    [dispatch],
  );

  const clearError = useCallback(() => {
    dispatch({ type: "DISCOUNT_CLEAR_ERROR" });
  }, [dispatch]);

  return { updatePromoCode, applyPromo, removeDiscountCode, clearError };
}
