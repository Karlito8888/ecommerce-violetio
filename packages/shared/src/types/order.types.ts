/**
 * Order-related placeholder types.
 * Full implementation in Story 5.1 (order confirmation & data persistence).
 */

/** Violet bag fulfillment status. */
export type BagStatus =
  | "PENDING"
  | "AWAITING_PAYMENT"
  | "IN_PROGRESS"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

/** A completed or in-progress order. */
export interface Order {
  id: string;
  cartId: string;
  userId: string;
  status: BagStatus;
  /** Total in integer cents */
  total: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

/** A Stripe payment intent for checkout. */
export interface PaymentIntent {
  id: string;
  clientSecret: string;
  /** Amount in integer cents */
  amount: number;
  currency: string;
}

/** A webhook event payload from Violet. */
export interface WebhookEvent {
  id: string;
  type: string;
  data: unknown;
  createdAt: string;
}
