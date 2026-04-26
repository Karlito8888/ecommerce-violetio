import { createServerFn } from "@tanstack/react-start";
import type { MerchantRow } from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";

/**
 * Server Function — fetch all connected merchants from Violet API.
 *
 * Calls GET /v1/merchants directly — the canonical source of truth.
 * The Supabase `merchants` table is only populated by webhooks
 * (MERCHANT_CONNECTED) and may be empty in dev/test environments.
 *
 * Returns all connected merchants, sorted by name.
 *
 * @see https://docs.violet.io/api-reference/merchants/get-merchants
 */
export const getMerchantsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MerchantRow[]> => {
    const adapter = getAdapter();
    const result = await adapter.listMerchants();

    if (result.error || !result.data) return [];

    // Sort alphabetically by name (Violet may not guarantee order)
    return result.data.sort((a, b) => a.name.localeCompare(b.name));
  },
);

/**
 * Server Function — fetch all connected merchants with their published offer counts.
 *
 * Enriches each merchant with `offer_count` from
 * GET /catalog/offers/merchants/{id}/count.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/count-merchant-offers
 */
export const getMerchantsWithCountsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MerchantRow[]> => {
    const adapter = getAdapter();
    const result = await adapter.listMerchants(true);

    if (result.error || !result.data) return [];

    return result.data.sort((a, b) => a.name.localeCompare(b.name));
  },
);
