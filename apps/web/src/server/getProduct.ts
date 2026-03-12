import { createServerFn } from "@tanstack/react-start";
import { createSupplierAdapter } from "@ecommerce/shared";
import type { ApiResponse, Product } from "@ecommerce/shared";

/* ─── Adapter Factory ─────────────────────────────────────────────────── */

/**
 * Loads Violet config from env vars and creates a SupplierAdapter.
 *
 * Identical to the factory in `getProducts.ts` — extracted as a local helper
 * because TanStack Start server functions are module-scoped and each server
 * module needs its own adapter instance.
 *
 * @returns A configured SupplierAdapter, or throws if env vars are missing
 */
function getAdapter() {
  const appId = process.env.VIOLET_APP_ID;
  const appSecret = process.env.VIOLET_APP_SECRET;
  const username = process.env.VIOLET_USERNAME;
  const password = process.env.VIOLET_PASSWORD;
  const apiBase = process.env.VIOLET_API_BASE ?? "https://sandbox-api.violet.io/v1";

  if (!appId || !appSecret || !username || !password) {
    throw new Error(
      "Missing required Violet env vars: VIOLET_APP_ID, VIOLET_APP_SECRET, VIOLET_USERNAME, VIOLET_PASSWORD",
    );
  }

  return createSupplierAdapter({
    supplier: "violet",
    violet: { appId, appSecret, username, password, apiBase },
  });
}

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
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
 */
export const getProductFn = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(async ({ data: productId }): Promise<ApiResponse<Product>> => {
    const adapter = getAdapter();
    return adapter.getProduct(productId);
  });
