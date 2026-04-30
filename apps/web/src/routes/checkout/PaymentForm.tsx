/**
 * PaymentForm — inner form rendered inside Stripe's `<Elements>` provider.
 *
 * Extracted as a child component because `useStripe()` and `useElements()`
 * hooks MUST be called inside an `<Elements>` provider. They throw if called
 * in the same component that renders `<Elements>`.
 *
 * ## Submit flow
 * 1. `stripe.confirmPayment({ redirect: "if_required" })` — authorizes card
 * 2. On success: call `submitOrderFn` — Violet charges the card
 * 3. Error-specific handling (lost confirmation polling, 409, 412)
 * 4. Delegate 3DS + status handling to shared `useOrderSubmit` hook
 *
 * @see Story 4.4 C3 — complete submit flow reference
 */
import { useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getCartFn } from "../../server/cartActions";
import { clearCartCookieFn, logClientErrorFn, submitOrderFn } from "../../server/checkout";
import { ORDER_STATUS_MESSAGES } from "@ecommerce/shared";
import { useOrderSubmit } from "./useOrderSubmit";

interface PaymentFormProps {
  appOrderId: string;
  /**
   * Violet cart ID — needed for lost confirmation polling (Story 4.7 AC#3).
   *
   * `violetCartId` must be the Violet integer cart ID (as string), NOT the UUID.
   * @see Code Review Fix — C2
   */
  violetCartId: string;
  onSuccess: (orderId: string) => void;
  /** Story 4.7: Pre-submit inventory validation callback */
  onPreSubmitValidation?: () => Promise<boolean>;
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

export function PaymentForm({
  appOrderId,
  violetCartId,
  onSuccess,
  onPreSubmitValidation,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentLoadError, setPaymentLoadError] = useState<string | null>(null);
  const { submitOrder: sharedSubmit } = useOrderSubmit({ stripe, appOrderId, onSuccess });

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
     * card payments. This call AUTHORIZES the card but does NOT charge it.
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
     *
     * PaymentForm handles error-specific cases (lost confirmation polling, 409, 412)
     * BEFORE delegating to the shared hook, because it has access to `violetCartId`
     * for polling and specific error code messaging that WalletCheckoutForm doesn't need.
     */
    const result = await submitOrderFn({ data: { appOrderId } });

    if (result.error) {
      /**
       * Story 4.7 AC#3: Lost confirmation polling.
       *
       * When submit returns a network/timeout error, the order may have actually
       * been placed. Poll the cart status before showing an error.
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
            await clearCartCookieFn();
            setSubmitError(null);
            setIsSubmitting(false);
            onSuccess("");
            return;
          }
        }
        setSubmitError(ORDER_STATUS_MESSAGES.LOST_CONFIRMATION);
        setIsSubmitting(false);
        return;
      }

      if (result.error.code === "VIOLET.CONFLICT") {
        setSubmitError(
          "This order may have already been placed. Please check your email before trying again.",
        );
        setIsSubmitting(false);
        return;
      }

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

    // Delegate 3DS + REQUIRES_ACTION + REJECTED + CANCELED to shared hook
    const submitErr = await sharedSubmit();
    if (submitErr) {
      setSubmitError(submitErr);
      setIsSubmitting(false);
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
