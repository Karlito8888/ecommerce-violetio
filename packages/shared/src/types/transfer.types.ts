/**
 * Violet Transfer types — fund movement from platform to merchant.
 *
 * A Transfer represents the actual movement of funds from your Stripe Platform
 * Account to a merchant's Stripe Connect account. Transfers are created by Violet
 * automatically in Automatic Transfer mode, but can fail for various reasons
 * (missing payout account, KYC incomplete, insufficient funds, etc.).
 *
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/transfers
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers
 */

/** Violet Transfer status values. */
export type TransferStatus =
  | "PENDING"
  | "SENT"
  | "FAILED"
  | "PARTIALLY_SENT"
  | "REVERSED"
  | "PARTIALLY_REVERSED"
  | "BYPASSED";

/** Transfer as returned by the Violet API. */
export interface Transfer {
  /** Violet transfer ID */
  id: string;
  /** Merchant receiving the funds */
  merchantId: string;
  /** Stripe transfer ID (e.g., "tr_1QMs..."). Only present after success. */
  paymentProviderTransferId: string | null;
  /** Transfer status */
  status: TransferStatus;
  /** Amount transferred, in integer cents */
  amount: number;
  /** Currency code (e.g., "USD") */
  currency: string;
  /** Payment provider (always "STRIPE" for now) */
  paymentProvider: string;
  /** Violet Bag IDs associated with this transfer */
  relatedBags: string[];
  /** Violet Order IDs associated with this transfer */
  relatedOrders: string[];
  /** Violet Distribution IDs funded by this transfer */
  relatedDistributions: string[];
  /** Errors if status is FAILED */
  errors: TransferError[];
  /** ISO-8601 timestamp */
  dateCreated: string;
  /** ISO-8601 timestamp */
  dateLastModified: string;
}

/** Error detail on a failed Transfer. */
export interface TransferError {
  payoutTransferId?: number;
  errorCode?: number;
  errorMessage?: string;
  dateCreated?: string;
}

/** Supabase row type for the `order_transfers` table. */
export interface TransferRow {
  id: string;
  violet_transfer_id: string;
  order_id: string;
  violet_order_id: string;
  violet_bag_id: string | null;
  merchant_id: string;
  payment_provider_transfer_id: string | null;
  status: TransferStatus;
  amount_cents: number;
  currency: string;
  errors: TransferError[] | null;
  synced_at: string;
}

/** Input for retry transfer server function. */
export interface RetryTransferInput {
  /** Retry scope */
  scope: "order" | "bag";
  /** Violet entity ID */
  violetId: string;
}

/** Search transfers filter input. */
export interface SearchTransfersInput {
  status?: TransferStatus;
  merchantId?: string;
  createdAfter?: string;
  createdBefore?: string;
}
