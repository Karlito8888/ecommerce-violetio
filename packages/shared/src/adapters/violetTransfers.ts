/**
 * Violet Transfer API client — search transfers, retry failed transfers.
 *
 * Provides functions to:
 * - Search transfers with filters (status, merchant, date range)
 * - Retry failed transfers (single order, single bag, bulk)
 *
 * All amounts are integer cents. All calls require Violet authentication headers.
 *
 * @see https://docs.violet.io/prism/payments/payments-during-checkout/guides/handling-failed-transfers
 * @see https://docs.violet.io/api-reference/payments/transfers/search-transfers
 */

import type { ApiResponse } from "../types/index.js";
import type {
  Transfer,
  SearchTransfersInput,
  PendingTransferSummary,
  GetPendingTransfersInput,
  TransferDetail,
} from "../types/transfer.types.js";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";

/**
 * Search transfers via POST /v1/payments/transfers.
 *
 * Returns a paginated list of transfers matching the filter criteria.
 * Use this to find FAILED transfers for admin monitoring and retry workflows.
 */
export async function searchTransfers(
  ctx: CatalogContext,
  input: SearchTransfersInput = {},
): Promise<ApiResponse<Transfer[]>> {
  const body: Record<string, unknown> = {};
  if (input.status) body.status = input.status;
  if (input.merchantId) body.merchant_id = Number(input.merchantId);
  if (input.createdAfter) body.created_after = input.createdAfter;
  if (input.createdBefore) body.created_before = input.createdBefore;

  const result = await fetchWithRetry(
    `${ctx.apiBase}/payments/transfers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const raw = result.data as unknown;
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : (((raw as Record<string, unknown>).content as unknown[]) ?? []);

  const transfers: Transfer[] = items.map(mapTransfer);
  return { data: transfers, error: null };
}

/**
 * Retry transfer for a single order.
 * POST /v1/order-service/transfers/order/{order_id}
 */
export async function retryTransferForOrder(
  ctx: CatalogContext,
  violetOrderId: string,
): Promise<ApiResponse<{ message: string }>> {
  return retryTransfer(ctx, `order/${violetOrderId}`);
}

/**
 * Retry transfer for a single bag.
 * POST /v1/order-service/transfers/bag/{bag_id}
 */
export async function retryTransferForBag(
  ctx: CatalogContext,
  violetBagId: string,
): Promise<ApiResponse<{ message: string }>> {
  return retryTransfer(ctx, `bag/${violetBagId}`);
}

/**
 * Retry transfers for multiple orders.
 * POST /v1/order-service/transfers/orders
 */
export async function retryTransfersForOrders(
  ctx: CatalogContext,
  violetOrderIds: string[],
): Promise<ApiResponse<{ message: string }>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/order-service/transfers/orders`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_ids: violetOrderIds.map(Number) }),
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };
  return { data: { message: "Retry initiated" }, error: null };
}

/**
 * Retry transfers for multiple bags.
 * POST /v1/order-service/transfers/bags
 */
export async function retryTransfersForBags(
  ctx: CatalogContext,
  violetBagIds: string[],
): Promise<ApiResponse<{ message: string }>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/order-service/transfers/bags`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bag_ids: violetBagIds.map(Number) }),
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };
  return { data: { message: "Retry initiated" }, error: null };
}

/**
 * Get pending transfers via GET /v1/payments/transfers/pending.
 *
 * Returns an aggregated view of transfers in PENDING status grouped by merchant.
 * Each entry includes the total pending amount, distribution count, and
 * the associated payout account details.
 *
 * Useful for proactive monitoring — if transfers stay PENDING for too long,
 * it may indicate a Stripe/Violet issue requiring investigation.
 *
 * @see https://docs.violet.io/api-reference/payments/transfers/get-pending-transfers
 */
export async function getPendingTransfers(
  ctx: CatalogContext,
  input: GetPendingTransfersInput = {},
): Promise<ApiResponse<PendingTransferSummary[]>> {
  const params = new URLSearchParams();
  if (input.merchantId) params.set("merchant_id", input.merchantId);
  if (input.appId) params.set("app_id", input.appId);

  const query = params.toString();
  const url = `${ctx.apiBase}/payments/transfers/pending${query ? `?${query}` : ""}`;

  const result = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const raw = result.data as unknown;
  const items: unknown[] = Array.isArray(raw) ? raw : [];

  const summaries: PendingTransferSummary[] = items.map(mapPendingTransferSummary);
  return { data: summaries, error: null };
}

/**
 * Get a single transfer by its Violet Transfer ID.
 *
 * Returns the full transfer detail including payout references,
 * transfer mechanism, effective related entity IDs, and reversal IDs.
 *
 * Useful for manual refresh of a specific transfer's status
 * (e.g., after a TRANSFER_FAILED webhook, check if it was retried successfully).
 *
 * @see https://docs.violet.io/api-reference/payments/transfers/get-transfer-by-id
 */
export async function getTransfer(
  ctx: CatalogContext,
  transferId: string,
): Promise<ApiResponse<TransferDetail>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/payments/transfers/${transferId}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const detail = mapTransferDetail(result.data);
  return { data: detail, error: null };
}

/**
 * Get a transfer by its Stripe/payment provider transfer ID.
 *
 * Looks up a Violet transfer using the external ID (e.g., Stripe transfer ID "tr_1QMs...").
 * Returns the same full TransferDetail as getTransfer().
 *
 * Useful for reconciliation — matching Stripe Dashboard transfers to Violet orders,
 * or debugging when Stripe shows a transfer but the corresponding Violet order is unknown.
 *
 * @see https://docs.violet.io/api-reference/payments/transfers/get-transfer-by-payment-provider-transfer-id
 */
export async function getTransferByProviderId(
  ctx: CatalogContext,
  providerTransferId: string,
): Promise<ApiResponse<TransferDetail>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/payments/transfers/external/${providerTransferId}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const detail = mapTransferDetail(result.data);
  return { data: detail, error: null };
}

// ─── Internal helpers ────────────────────────────────────────────────

function mapTransfer(raw: unknown): Transfer {
  const d = raw as Record<string, unknown>;
  return {
    id: String(d.id ?? ""),
    merchantId: String(d.merchant_id ?? ""),
    paymentProviderTransferId: (d.payment_provider_transfer_id as string) ?? null,
    status: (d.status as Transfer["status"]) ?? "PENDING",
    amount: Number(d.amount ?? 0),
    currency: (d.currency as string) ?? "USD",
    paymentProvider: (d.payment_provider as string) ?? "STRIPE",
    relatedBags: ((d.related_bags as string[]) ?? []).map(String),
    relatedOrders: ((d.related_orders as string[]) ?? []).map(String),
    relatedDistributions: ((d.related_distributions as string[]) ?? []).map(String),
    errors: ((d.errors as Array<Record<string, unknown>>) ?? []).map((e) => ({
      payoutTransferId: e.payout_transfer_id as number | undefined,
      errorCode: e.error_code as number | undefined,
      errorMessage: e.error_message as string | undefined,
      dateCreated: e.date_created as string | undefined,
    })),
    dateCreated: (d.date_created as string) ?? "",
    dateLastModified: (d.date_last_modified as string) ?? "",
  };
}

async function retryTransfer(
  ctx: CatalogContext,
  path: string,
): Promise<ApiResponse<{ message: string }>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/order-service/transfers/${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };
  return { data: { message: "Retry initiated" }, error: null };
}

function mapPendingTransferSummary(raw: unknown): PendingTransferSummary {
  const d = raw as Record<string, unknown>;
  const pa = d.payout_account as Record<string, unknown> | undefined;

  return {
    merchantId: String(d.merchant_id ?? ""),
    amount: Number(d.amount ?? 0),
    currency: (d.currency as string) ?? "USD",
    relatedDistributions: ((d.related_distributions as unknown[]) ?? []).map(String),
    merchantName: (d.merchant_name as string) ?? "",
    distributionCount: Number(d.distribution_count ?? 0),
    payoutAccountId: d.payout_account_id != null ? String(d.payout_account_id) : null,
    payoutAccount: pa ? mapPendingPayoutAccount(pa) : null,
  };
}

function mapPendingPayoutAccount(
  pa: Record<string, unknown>,
): PendingTransferSummary["payoutAccount"] {
  return {
    id: String(pa.id ?? ""),
    accountType: (pa.account_type as string) ?? "",
    accountId: String(pa.account_id ?? ""),
    merchantId: String(pa.merchant_id ?? ""),
    appId: String(pa.app_id ?? ""),
    isActive: (pa.is_active as boolean) ?? false,
    countryCode: (pa.country_code as string) ?? "",
    paymentProvider: (pa.payment_provider as string) ?? "STRIPE",
    paymentProviderAccountId: (pa.payment_provider_account_id as string) ?? null,
    paymentProviderAccountType: (pa.payment_provider_account_type as string) ?? null,
    dateCreated: (pa.date_created as string) ?? "",
    dateLastModified: (pa.date_last_modified as string) ?? "",
  };
}

function mapTransferDetail(raw: unknown): TransferDetail {
  const d = raw as Record<string, unknown>;
  const base = mapTransfer(raw);

  return {
    ...base,
    paymentTransaction: d.payment_transaction != null ? String(d.payment_transaction) : null,
    payoutId: d.payout_id != null ? String(d.payout_id) : null,
    paymentProviderId: (d.payment_provider_id as string) ?? null,
    paymentProviderPayoutId: (d.payment_provider_payout_id as string) ?? null,
    payoutAccountId: d.payout_account_id != null ? String(d.payout_account_id) : null,
    bagAmount: Number(d.bag_amount ?? 0),
    bagCurrency: (d.bag_currency as string) ?? "",
    type: (d.type as TransferDetail["type"]) ?? null,
    transferMechanism: (d.transfer_mechanism as TransferDetail["transferMechanism"]) ?? null,
    idempotencyKey: (d.idempotency_key as string) ?? null,
    externalId: (d.externalId as string) ?? null,
    payoutExternalId: (d.payoutExternalId as string) ?? null,
    paymentService: (d.paymentService as string) ?? null,
    effectiveRelatedOrderIds: ((d.effectiveRelatedOrderIds as unknown[]) ?? []).map(String),
    effectiveRelatedBagIds: ((d.effectiveRelatedBagIds as unknown[]) ?? []).map(String),
    effectiveRelatedDistributionIds: ((d.effectiveRelatedDistributionIds as unknown[]) ?? []).map(
      String,
    ),
    effectiveTransferReversalIds: ((d.effectiveTransferReversalIds as unknown[]) ?? []).map(String),
    transferReversalIds: ((d.transfer_reversal_ids as unknown[]) ?? []).map(String),
    errors: ((d.errors as Array<Record<string, unknown>>) ?? []).map((e) => ({
      id: e.id as number | undefined,
      payoutTransferId: e.payout_transfer_id as number | undefined,
      errorCode: e.error_code as number | undefined,
      errorMessage: e.error_message as string | undefined,
      resolved: e.resolved as boolean | undefined,
      dateResolved: e.date_resolved as string | undefined,
      dateCreated: e.date_created as string | undefined,
    })),
  };
}
