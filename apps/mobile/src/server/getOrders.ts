/**
 * Mobile order fetch functions — authenticated order history from Supabase.
 *
 * These functions call the web backend API Routes which query Supabase
 * (NOT Violet API directly). This mirrors the web app's data source
 * (orderHandlers.ts) and enables Realtime subscriptions for live updates.
 *
 * ## Data flow
 * ```
 * Mobile UI → fetchOrdersMobile() → GET /api/orders (web backend)
 *            → orderDetailHandler() → Supabase (RLS-protected)
 * ```
 *
 * ## Why Supabase instead of Violet?
 * Violet's GET /orders returns all orders for the app_id (no per-user filtering).
 * Our Supabase mirror with RLS provides per-user scoping at the database level.
 * The web app uses the exact same data source for /account/orders pages.
 *
 * @see apps/web/src/routes/api/orders/index.ts — API Route: GET /api/orders
 * @see apps/web/src/routes/api/orders/$orderId.ts — API Route: GET /api/orders/:orderId
 * @see apps/web/src/server/orderHandlers.ts — Core Supabase query logic
 * @see apps/mobile/src/app/orders/index.tsx — Mobile order list consumer
 * @see apps/mobile/src/app/orders/[orderId].tsx — Mobile order detail consumer
 */

import { apiGet } from "./apiClient";
import type { ApiResponse, OrderWithBagCount, OrderWithBagsAndItems } from "@ecommerce/shared";

/**
 * Fetches the authenticated user's order history (newest first).
 *
 * Returns orders with a `bag_count` field for list display.
 * Requires a valid Supabase JWT (injected by apiClient).
 *
 * @returns Array of orders with bag counts, empty if no orders.
 * @throws Error on auth failure or network error.
 */
export async function fetchOrdersMobile(): Promise<OrderWithBagCount[]> {
  const result = await apiGet<ApiResponse<OrderWithBagCount[]>>("/api/orders");
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data ?? [];
}

/**
 * Fetches a single order with full bag/item/refund details from Supabase.
 *
 * The `source=supabase` query param tells the API Route to use orderDetailHandler
 * (Supabase query) instead of the default getOrderDetailsFn (Violet API).
 * This returns the same data shape as the web's /account/orders/$orderId page.
 *
 * @param orderId - Supabase order UUID (NOT Violet numeric order ID)
 * @returns Full order with nested bags, items, and refunds, or null if not found.
 * @throws Error on auth failure or network error.
 */
export async function fetchOrderDetailMobile(
  orderId: string,
): Promise<OrderWithBagsAndItems | null> {
  const result = await apiGet<ApiResponse<OrderWithBagsAndItems | null>>(
    `/api/orders/${orderId}?source=supabase`,
  );
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data ?? null;
}
