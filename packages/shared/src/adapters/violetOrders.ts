/**
 * Violet order operations: getOrder, getOrderDistributions, getOrders.
 */

import type {
  ApiResponse,
  Order,
  OrderDetail,
  OrderBag,
  OrderBagItem,
  OrderStatus,
  BagStatus,
  BagFinancialStatus,
  FulfillmentStatus,
  Distribution,
  DistributionType,
  DistributionStatus,
} from "../types/index.js";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";

/**
 * Fetches complete order details from Violet's GET /orders/{id}.
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/get-order-by-id
 */
export async function getOrder(
  ctx: CatalogContext,
  orderId: string,
): Promise<ApiResponse<OrderDetail>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/orders/${orderId}`,
    { method: "GET" },
    ctx.tokenManager,
  );
  if (result.error) return { data: null, error: result.error };

  const data = result.data as Record<string, unknown>;

  // Check 200-with-errors pattern
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const firstError = data.errors[0] as Record<string, unknown> | undefined;
    return {
      data: null,
      error: {
        code: "VIOLET.ORDER_ERROR",
        message: String(firstError?.message ?? "Order has errors"),
      },
    };
  }

  const rawBags = (data.bags as Array<Record<string, unknown>>) ?? [];
  const bags: OrderBag[] = rawBags.map((bag) => {
    const rawSkus = (bag.skus as Array<Record<string, unknown>>) ?? [];
    const items: OrderBagItem[] = rawSkus.map((sku) => ({
      skuId: String(sku.id ?? ""),
      name: String(sku.name ?? ""),
      quantity: Number(sku.quantity ?? 0),
      price: Number(sku.price ?? 0),
      linePrice: Number(sku.line_price ?? 0),
      thumbnail: (sku.thumbnail as string) || undefined,
    }));

    const shippingMethodRaw = bag.shipping_method as Record<string, unknown> | undefined;

    return {
      id: String(bag.id ?? ""),
      merchantId: String(bag.merchant_id ?? ""),
      merchantName: String(bag.merchant_name ?? ""),
      status: String(bag.status ?? "IN_PROGRESS") as BagStatus,
      financialStatus: String(bag.financial_status ?? "UNPAID") as BagFinancialStatus,
      fulfillmentStatus: (bag.fulfillment_status as FulfillmentStatus) ?? "PROCESSING",
      items,
      subtotal: Number(bag.sub_total ?? 0),
      shippingTotal: Number(bag.shipping_total ?? 0),
      taxTotal: Number(bag.tax_total ?? 0),
      total: Number(bag.total ?? 0),
      shippingMethod: shippingMethodRaw
        ? {
            carrier: String(shippingMethodRaw.carrier ?? ""),
            label: String(shippingMethodRaw.label ?? ""),
          }
        : undefined,
      commissionRate: Number(bag.commission_rate ?? 10),
    };
  });

  const rawCustomer = (data.customer as Record<string, unknown>) ?? {};
  const rawShipping = (data.shipping_address as Record<string, unknown>) ?? {};

  return {
    data: {
      id: String(data.id ?? ""),
      status: (data.status ?? "COMPLETED") as OrderStatus,
      currency: String(data.currency ?? "USD"),
      subtotal: Number(data.sub_total ?? 0),
      shippingTotal: Number(data.shipping_total ?? 0),
      taxTotal: Number(data.tax_total ?? 0),
      total: Number(data.total ?? 0),
      bags,
      customer: {
        email: String(rawCustomer.email ?? ""),
        firstName: String(rawCustomer.first_name ?? ""),
        lastName: String(rawCustomer.last_name ?? ""),
      },
      shippingAddress: {
        address1: String(rawShipping.address_1 ?? ""),
        city: String(rawShipping.city ?? ""),
        state: String(rawShipping.state ?? ""),
        postalCode: String(rawShipping.postal_code ?? ""),
        country: String(rawShipping.country ?? ""),
      },
      dateSubmitted: (data.date_submitted as string) || undefined,
    },
    error: null,
  };
}

export async function getOrderDistributions(
  ctx: CatalogContext,
  violetOrderId: string,
): Promise<ApiResponse<Distribution[]>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/orders/${violetOrderId}/distributions`,
    { method: "GET" },
    ctx.tokenManager,
  );
  if (result.error) return { data: null, error: result.error };

  return { data: parseDistributions(result.data), error: null };
}

/**
 * Shared helper to parse distribution items from Violet API responses.
 * Used by both getOrderDistributions and searchDistributions.
 */
function parseDistributions(raw: unknown): Distribution[] {
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : (((raw as Record<string, unknown>)?.content as unknown[]) ?? []);

  return items.map((item: unknown) => {
    const d = item as Record<string, unknown>;
    return {
      violetBagId: d["bag_id"] != null ? String(d["bag_id"]) : null,
      type: (d["type"] as DistributionType) ?? "PAYMENT",
      status: (d["status"] as DistributionStatus) ?? "PENDING",
      channelAmountCents: Number(d["channel_amount"] ?? 0),
      stripeFee: Number(d["stripe_fee"] ?? 0),
      merchantAmountCents: Number(d["merchant_amount"] ?? 0),
      subtotalCents: Number(d["subtotal"] ?? 0),
    };
  });
}

/**
 * Search distributions across all orders with filters.
 *
 * Calls `POST /payments/DEVELOPER/{app_id}/distributions/search`.
 * Returns paginated results matching the search criteria.
 *
 * ## Pagination
 * Violet uses 1-based pages (Spring Boot Pageable).
 *
 * @param ctx - Catalog context with API base URL and token manager
 * @param appId - Violet App ID (used as developer account ID for the search)
 * @param input - Optional search filters (order, merchant, dates, etc.)
 * @param page - 1-based page number (default: 1)
 * @param pageSize - Items per page (default: 20)
 *
 * @see https://docs.violet.io/api-reference/payments/distributions/search-distributions
 */
export async function searchDistributions(
  ctx: CatalogContext,
  appId: string,
  input: import("../types/distribution.types.js").SearchDistributionsInput = {},
  page = 1,
  pageSize = 20,
): Promise<ApiResponse<import("../types/distribution.types.js").PaginatedDistributions>> {
  const body: Record<string, unknown> = {};
  if (input.orderId) body.order_id = Number(input.orderId);
  if (input.merchantId) body.merchant_id = Number(input.merchantId);
  if (input.bagId) body.bag_id = Number(input.bagId);
  if (input.externalOrderId) body.external_order_id = input.externalOrderId;
  if (input.payoutId) body.payout_id = Number(input.payoutId);
  if (input.payoutTransferId) body.payout_transfer_id = Number(input.payoutTransferId);
  if (input.beforeDate) body.before_date = input.beforeDate;
  if (input.afterDate) body.after_date = input.afterDate;

  const params = new URLSearchParams({
    page: String(page),
    size: String(pageSize),
    include_merchants: "true",
    include_channels: "true",
  });

  const result = await fetchWithRetry(
    `${ctx.apiBase}/payments/DEVELOPER/${appId}/distributions/search?${params}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  const raw = result.data as Record<string, unknown>;
  const distributions = parseDistributions(raw);

  return {
    data: {
      distributions,
      total: Number(raw.totalElements ?? raw.total_elements ?? distributions.length),
      page: Number(raw.number ?? raw.number ?? page),
      pageSize: Number(raw.size ?? pageSize),
      hasNext: !(raw.last ?? true),
    },
    error: null,
  };
}

export async function getOrders(
  _ctx: CatalogContext,
  _userId: string,
): Promise<ApiResponse<Order[]>> {
  throw new Error("Not implemented — Story 5.1");
}
