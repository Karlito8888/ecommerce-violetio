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

/**
 * Pending Transfer Summary — returned by GET /payments/transfers/pending.
 *
 * Aggregated view of pending transfers grouped by merchant.
 * Each entry represents a merchant with funds waiting to be transferred,
 * including the associated payout account details.
 *
 * @see https://docs.violet.io/api-reference/payments/transfers/get-pending-transfers
 */
export interface PendingTransferSummary {
  /** Merchant ID with pending transfers */
  merchantId: string;
  /** Total pending amount in integer cents */
  amount: number;
  /** Currency code (e.g., "USD") */
  currency: string;
  /** Distribution IDs pending transfer */
  relatedDistributions: string[];
  /** Merchant display name */
  merchantName: string;
  /** Number of pending distributions */
  distributionCount: number;
  /** Payout Account ID */
  payoutAccountId: string | null;
  /** Embedded Payout Account details */
  payoutAccount: PendingTransferPayoutAccount | null;
}

/** Embedded Payout Account within a PendingTransferSummary. */
export interface PendingTransferPayoutAccount {
  id: string;
  accountType: string;
  accountId: string;
  merchantId: string;
  appId: string;
  isActive: boolean;
  countryCode: string;
  paymentProvider: string;
  paymentProviderAccountId: string | null;
  paymentProviderAccountType: string | null;
  dateCreated: string;
  dateLastModified: string;
}

/** Input for getPendingTransfers — optional filters. */
export interface GetPendingTransfersInput {
  merchantId?: string;
  appId?: string;
}

/**
 * Transfer type values — who the transfer is for.
 * MERCHANT = transfer to merchant's Connect account.
 */
export type TransferType = "MERCHANT";

/** Transfer mechanism — how funds are moved. */
export type TransferMechanism = "STANDARD_TRANSFERS" | "DESTINATION_PAYMENTS";

/**
 * Detailed Transfer — returned by GET /payments/transfers/{transfer_id}.
 *
 * Extends the base Transfer with additional fields only available
 * when fetching a single transfer by ID: payout references,
 * transfer mechanism, effective related entity IDs, reversal IDs, etc.
 *
 * @see https://docs.violet.io/api-reference/payments/transfers/get-transfer-by-id
 */
export interface TransferDetail extends Transfer {
  /** Payment transaction ID associated with this transfer */
  paymentTransaction: string | null;
  /** Payout ID this transfer belongs to */
  payoutId: string | null;
  /** Payment provider internal ID (e.g., Stripe transfer ID "tr_...") */
  paymentProviderId: string | null;
  /** Payment provider payout ID */
  paymentProviderPayoutId: string | null;
  /** Payout Account ID used for this transfer */
  payoutAccountId: string | null;
  /** Bag-level amount in integer cents */
  bagAmount: number;
  /** Bag-level currency */
  bagCurrency: string;
  /** Transfer type (MERCHANT) */
  type: TransferType | null;
  /** Transfer mechanism */
  transferMechanism: TransferMechanism | null;
  /** Idempotency key for deduplication */
  idempotencyKey: string | null;
  /** Extended errors with resolved status */
  errors: TransferDetailError[];
  /** External ID (e.g., from payment provider) */
  externalId: string | null;
  /** External payout ID */
  payoutExternalId: string | null;
  /** Payment service (e.g., "STRIPE") */
  paymentService: string | null;
  /** Effective order IDs (resolved after splits) */
  effectiveRelatedOrderIds: string[];
  /** Effective bag IDs (resolved after splits) */
  effectiveRelatedBagIds: string[];
  /** Effective distribution IDs */
  effectiveRelatedDistributionIds: string[];
  /** Transfer reversal IDs */
  effectiveTransferReversalIds: string[];
  /** Transfer reversal IDs (legacy field) */
  transferReversalIds: string[];
}

/** Extended error with resolved status — from GET /transfers/{id}. */
export interface TransferDetailError extends TransferError {
  id?: number;
  resolved?: boolean;
  dateResolved?: string;
}
