/**
 * Violet distribution types — payment breakdown per order bag.
 *
 * A Distribution records exactly how funds were split for one bag:
 * - `channelAmountCents`: our commission (before Stripe fees)
 * - `stripeFee`: Stripe's cut (always deducted from channel share)
 * - `merchantAmountCents`: what the merchant received
 *
 * @see https://docs.violet.io/prism/payments/payouts/distributions
 */

export type DistributionType = "PAYMENT" | "REFUND" | "ADJUSTMENT";
export type DistributionStatus = "PENDING" | "QUEUED" | "SENT" | "FAILED";

/** Distribution as returned by the Violet API (camelCase internal type). */
export interface Distribution {
  /** Violet bag ID this distribution belongs to */
  violetBagId: string | null;
  type: DistributionType;
  status: DistributionStatus;
  /** Channel commission before Stripe fees, in integer cents */
  channelAmountCents: number;
  /** Stripe processing fees deducted from channel share, in integer cents */
  stripeFee: number;
  /** Amount transferred to merchant, in integer cents */
  merchantAmountCents: number;
  /** Bag subtotal this distribution was calculated from, in integer cents */
  subtotalCents: number;
}

/** Supabase row type for the `order_distributions` table. */
export interface DistributionRow {
  id: string;
  order_bag_id: string;
  violet_order_id: string;
  violet_bag_id: string | null;
  type: DistributionType;
  status: DistributionStatus;
  channel_amount_cents: number;
  stripe_fee_cents: number;
  merchant_amount_cents: number;
  subtotal_cents: number;
  synced_at: string;
}

/**
 * Search filters for `POST /payments/DEVELOPER/{id}/distributions/search`.
 *
 * All fields optional — omit for broad search.
 *
 * @see https://docs.violet.io/api-reference/payments/distributions/search-distributions
 */
export interface SearchDistributionsInput {
  orderId?: string;
  merchantId?: string;
  bagId?: string;
  externalOrderId?: string;
  payoutId?: string;
  payoutTransferId?: string;
  beforeDate?: string;
  afterDate?: string;
}

/** Paginated distribution search result. */
export interface PaginatedDistributions {
  distributions: Distribution[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}
