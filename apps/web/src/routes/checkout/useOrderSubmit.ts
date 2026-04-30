/**
 * useOrderSubmit — shared Violet order submission + 3DS handling.
 *
 * Extracted from PaymentForm and WalletCheckoutForm to avoid duplicating
 * the submit → 3DS → retry logic across the two payment flows.
 *
 * ## Flow
 * 1. Call `submitOrderFn` with `appOrderId` (+ optional `orderCustomer` for wallet)
 * 2. On REQUIRES_ACTION → `stripe.handleNextAction()` → re-submit with same `appOrderId`
 * 3. On REJECTED / CANCELED → return error message
 * 4. On success → call `onSuccess`
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/order-and-bag-states
 * @see https://docs.violet.io/prism/checkout-guides/guides/violet-checkout-with-stripejs-v3
 */
import type { Stripe } from "@stripe/stripe-js";
import { submitOrderFn } from "../../server/checkout";
import type { OrderSubmitInput } from "@ecommerce/shared";

import { ORDER_STATUS_MESSAGES } from "@ecommerce/shared";

interface UseOrderSubmitOptions {
  stripe: Stripe | null;
  appOrderId: string;
  onSuccess: (orderId: string) => void;
}

interface SubmitParams {
  /** Wallet-specific customer info (Apple Pay / Google Pay full address). */
  orderCustomer?: OrderSubmitInput["orderCustomer"];
}

/** Messages for terminal order statuses — DRY shared with mobile via @ecommerce/shared. */
export { ORDER_STATUS_MESSAGES };

export function useOrderSubmit({ stripe, appOrderId, onSuccess }: UseOrderSubmitOptions) {
  /**
   * Submit order to Violet, handle 3DS if needed, and call onSuccess on completion.
   * Returns an error string if the flow fails, or `null` on success.
   */
  async function submitOrder(params: SubmitParams = {}): Promise<string | null> {
    const result = await submitOrderFn({
      data: { appOrderId, orderCustomer: params.orderCustomer },
    });

    if (result.error) {
      return result.error.message;
    }

    // 3D Secure challenge
    if (result.data?.status === "REQUIRES_ACTION") {
      const secret = result.data.paymentIntentClientSecret;
      if (!secret) return ORDER_STATUS_MESSAGES.REQUIRES_ACTION_NO_SECRET;
      if (!stripe) return ORDER_STATUS_MESSAGES.REQUIRES_ACTION_FAILED;

      const { error: actionError } = await stripe.handleNextAction({ clientSecret: secret });
      if (actionError) {
        return actionError.message ?? ORDER_STATUS_MESSAGES.REQUIRES_ACTION_FAILED;
      }

      // Re-submit after 3DS success (reuse same appOrderId for idempotency)
      const retryResult = await submitOrderFn({ data: { appOrderId } });
      if (
        retryResult.error ||
        retryResult.data?.status === "REJECTED" ||
        retryResult.data?.status === "CANCELED"
      ) {
        return retryResult.error?.message ?? ORDER_STATUS_MESSAGES.RETRY_FAILED;
      }

      onSuccess(retryResult.data?.id ?? "");
      return null;
    }

    if (result.data?.status === "REJECTED") return ORDER_STATUS_MESSAGES.REJECTED;
    if (result.data?.status === "CANCELED") return ORDER_STATUS_MESSAGES.CANCELED;

    // Success — COMPLETED (full or partial)
    onSuccess(result.data?.id ?? "");
    return null;
  }

  return { submitOrder };
}
