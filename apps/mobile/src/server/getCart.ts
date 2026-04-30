/**
 * Mobile fetch functions for cart operations via the web backend API.
 *
 * - Get cart:     GET  /api/cart/:cartId
 * - Update item:  PUT  /api/cart/:cartId/skus/:skuId
 * - Remove item:  DELETE /api/cart/:cartId/skus/:skuId
 *
 * Types imported from @ecommerce/shared — no local duplication.
 *
 * @see audit-dry-kiss-duplications.md — Phase 2 migration
 */
import type { ApiResponse, Cart } from "@ecommerce/shared";
import { apiGet, apiPut, apiDelete } from "./apiClient";

/** Fetch the current cart by Violet cart ID. */
export async function fetchCartMobile(violetCartId: string): Promise<ApiResponse<Cart>> {
  try {
    return await apiGet<ApiResponse<Cart>>(`/api/cart/${violetCartId}`);
  } catch {
    return {
      data: null,
      error: { code: "CART.NETWORK_ERROR", message: "Network error. Check your connection." },
    };
  }
}

/** Update a cart item's quantity. */
export async function updateCartItemMobile(
  violetCartId: string,
  skuId: string,
  quantity: number,
): Promise<ApiResponse<Cart>> {
  try {
    return await apiPut<ApiResponse<Cart>>(`/api/cart/${violetCartId}/skus/${skuId}`, { quantity });
  } catch {
    return {
      data: null,
      error: { code: "CART.NETWORK_ERROR", message: "Network error. Check your connection." },
    };
  }
}

/** Remove an item from the cart. */
export async function removeCartItemMobile(
  violetCartId: string,
  skuId: string,
): Promise<ApiResponse<Cart>> {
  try {
    return await apiDelete<ApiResponse<Cart>>(`/api/cart/${violetCartId}/skus/${skuId}`);
  } catch {
    return {
      data: null,
      error: { code: "CART.NETWORK_ERROR", message: "Network error. Check your connection." },
    };
  }
}
