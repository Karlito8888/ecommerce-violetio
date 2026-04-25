/**
 * Mobile fetch functions for merchants via the web backend API.
 *
 * - Merchants list: GET /api/merchants
 * - Merchant detail: GET /api/merchants/:id
 * - Merchant products: GET /api/merchants/:id/products
 *
 * Types are imported from @ecommerce/shared — no local duplication.
 *
 * @see audit-dual-backend.md — Phase 3 migration
 */
import type {
  ApiResponse,
  MerchantDetail,
  MerchantRow,
  PaginatedResult,
  Product,
} from "@ecommerce/shared";
import { apiGet } from "./apiClient";

/**
 * Fetch all connected merchants via web backend.
 *
 * Returns merchants sorted alphabetically (sorting done server-side).
 */
export async function fetchMerchantsMobile(): Promise<ApiResponse<MerchantRow[]>> {
  try {
    return await apiGet<ApiResponse<MerchantRow[]>>("/api/merchants");
  } catch (err) {
    return {
      data: null,
      error: {
        code: "MERCHANTS.UNEXPECTED",
        message: err instanceof Error ? err.message : "Failed",
      },
    };
  }
}

/**
 * Fetch a single merchant's details by ID via web backend.
 */
export async function fetchMerchantByIdMobile(id: string): Promise<ApiResponse<MerchantDetail>> {
  try {
    return await apiGet<ApiResponse<MerchantDetail>>(`/api/merchants/${id}`);
  } catch (err) {
    return {
      data: null,
      error: {
        code: "MERCHANTS.UNEXPECTED",
        message: err instanceof Error ? err.message : "Failed",
      },
    };
  }
}

/**
 * Fetch paginated products for a specific merchant via web backend.
 *
 * Contextual pricing is handled server-side via getCountryCookieFn
 * (resolved in the server function, not duplicated here).
 */
export async function fetchMerchantProductsMobile(
  merchantId: string,
  page = 1,
  pageSize = 12,
): Promise<ApiResponse<PaginatedResult<Product>>> {
  try {
    return await apiGet(`/api/merchants/${merchantId}/products?page=${page}&pageSize=${pageSize}`);
  } catch (err) {
    return {
      data: null,
      error: {
        code: "MERCHANT_PRODUCTS.UNEXPECTED",
        message: err instanceof Error ? err.message : "Failed",
      },
    };
  }
}
