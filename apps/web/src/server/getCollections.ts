import { createServerFn } from "@tanstack/react-start";
import type { ApiResponse, PaginatedResult, Product } from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";
import { getCountryCookieFn } from "./geoip";

/**
 * Server Function — fetch paginated products for a collection via Violet API.
 *
 * Calls `GET /catalog/collections/{id}/offers` via VioletAdapter.
 * Requires `sync_collections` feature flag enabled for the merchant.
 *
 * @see https://docs.violet.io/api-reference/catalog/collections/get-collection-offers
 */
export const getCollectionProductsFn = createServerFn({ method: "GET" })
  .inputValidator((input: { collectionId: string; page?: number; pageSize?: number }) => input)
  .handler(async ({ data }): Promise<ApiResponse<PaginatedResult<Product>>> => {
    const { countryCode } = await getCountryCookieFn();
    const adapter = getAdapter();
    return adapter.getCollectionOffers(
      data.collectionId,
      data.page ?? 1,
      data.pageSize ?? 12,
      countryCode ?? undefined,
    );
  });
