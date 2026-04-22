import { createServerFn } from "@tanstack/react-start";
import type { ApiResponse, MerchantDetail, PaginatedResult, Product } from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";
import { getCountryCookieFn } from "./geoip";

/**
 * Server Function — fetch a single merchant's details by ID.
 *
 * Calls GET /v1/merchants/{id} via the Violet adapter.
 * Used for the merchant page header/info section.
 *
 * @see https://docs.violet.io/api-reference/merchants/get-merchant-by-id
 */
export const getMerchantFn = createServerFn({ method: "GET" })
  .inputValidator((data: string) => data)
  .handler(async ({ data }): Promise<ApiResponse<MerchantDetail>> => {
    const adapter = getAdapter();
    return adapter.getMerchant(data);
  });

/**
 * Server Function — fetch paginated products for a specific merchant.
 *
 * Calls GET /catalog/offers/merchants/{id} with contextual pricing.
 * Supports infinite scroll pagination on the merchant page.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offers-for-a-merchant
 */
export const getMerchantProductsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { merchantId: string; page?: number; pageSize?: number }) => data)
  .handler(async ({ data }): Promise<ApiResponse<PaginatedResult<Product>>> => {
    const { merchantId, page, pageSize } = data;
    const adapter = getAdapter();

    const { countryCode } = await getCountryCookieFn();
    return adapter.getMerchantProducts(
      merchantId,
      { page: page ?? 1, pageSize: pageSize ?? 12 },
      countryCode ?? undefined,
    );
  });
