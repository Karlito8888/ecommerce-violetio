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

  const raw = result.data as unknown;
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : (((raw as Record<string, unknown>).content as unknown[]) ?? []);

  const distributions: Distribution[] = items.map((item: unknown) => {
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

  return { data: distributions, error: null };
}

export async function getOrders(
  _ctx: CatalogContext,
  _userId: string,
): Promise<ApiResponse<Order[]>> {
  throw new Error("Not implemented — Story 5.1");
}
