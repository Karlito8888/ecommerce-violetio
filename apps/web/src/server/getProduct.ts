import { createServerFn } from "@tanstack/react-start";
import type { ApiResponse, Product } from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";
import { getCountryCookieFn } from "./geoip";

/* ─── Server Function ─────────────────────────────────────────────────── */

/**
 * Server Function for fetching a single product by ID.
 *
 * Runs server-side only — Violet API credentials never reach the browser.
 * Called from TanStack Query's `queryFn` via the shared `productDetailQueryOptions`
 * hook (through the `ProductDetailFetchFn` adapter pattern).
 *
 * Uses `GET /catalog/offers/{offer_id}` via VioletAdapter.getProduct():
 * - Returns full Offer with variants, SKUs, albums, images
 * - Zod validation, retry logic, and snake_case→camelCase already handled by adapter
 * - 404 returns `{ data: null, error: { code: "NOT_FOUND", ... } }`
 *
 * Includes shipping info when a user country cookie is set.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
 */
export const getProductFn = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(async ({ data: productId }): Promise<ApiResponse<Product>> => {
    const { countryCode } = await getCountryCookieFn();
    const adapter = getAdapter();
    return adapter.getProduct(productId, countryCode ?? undefined);
  });
