/**
 * Order status messages — shared between web and mobile checkout flows.
 *
 * Single source of truth for user-facing error messages when Violet
 * returns terminal or action-required order statuses during submission.
 *
 * @see apps/web/src/routes/checkout/useOrderSubmit.ts — web consumer
 * @see apps/mobile/src/checkout/checkoutHooks.ts — mobile consumer
 */
export const ORDER_STATUS_MESSAGES = {
  /** Bag/order rejected by the merchant's e-commerce platform. */
  REJECTED: "Your order was rejected. Please try a different payment method.",
  /** Order canceled by the merchant. Card was not charged. */
  CANCELED: "Your order was canceled by the merchant. Your card was not charged. Please try again.",
  /** 3DS required but Violet returned no client secret. */
  REQUIRES_ACTION_NO_SECRET: "3D Secure required but no client secret returned",
  /** 3DS verification failed. */
  REQUIRES_ACTION_FAILED: "Payment verification failed. Please try again.",
  /** Re-submit after 3DS also failed. */
  RETRY_FAILED: "Order could not be completed after verification. Your card was not charged.",
  /** Lost confirmation — network error during submit, order may have gone through. */
  LOST_CONFIRMATION:
    "Your order may have been placed. Please check your email for confirmation before trying again.",
} as const;
