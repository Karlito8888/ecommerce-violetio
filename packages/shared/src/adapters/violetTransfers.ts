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
import type { Transfer, SearchTransfersInput } from "../types/transfer.types.js";
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
