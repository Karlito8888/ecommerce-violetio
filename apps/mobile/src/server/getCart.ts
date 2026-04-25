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
import type { Cart } from "@ecommerce/shared";
import { apiGet, apiPut, apiDelete } from "./apiClient";

/** Fetch the current cart by Violet cart ID. */
export async function fetchCartMobile(
  violetCartId: string,
): Promise<{ data: Cart | null; error: string | null }> {
  try {
    const json = await apiGet<{ data?: Cart; error?: { message?: string } }>(
      `/api/cart/${violetCartId}`,
    );
    return { data: json.data ?? null, error: json.error?.message ?? null };
  } catch {
    return { data: null, error: "Network error. Check your connection." };
  }
}

/** Update a cart item's quantity. */
export async function updateCartItemMobile(
  violetCartId: string,
  skuId: string,
  quantity: number,
): Promise<{ data: Cart | null; error: string | null }> {
  try {
    const json = await apiPut<{ data?: Cart; error?: { message?: string } }>(
      `/api/cart/${violetCartId}/skus/${skuId}`,
      { quantity },
    );
    return { data: json.data ?? null, error: json.error?.message ?? null };
  } catch {
    return { data: null, error: "Network error. Check your connection." };
  }
}

/** Remove an item from the cart. */
export async function removeCartItemMobile(
  violetCartId: string,
  skuId: string,
): Promise<{ data: Cart | null; error: string | null }> {
  try {
    const json = await apiDelete<{ data?: Cart; error?: { message?: string } }>(
      `/api/cart/${violetCartId}/skus/${skuId}`,
    );
    return { data: json.data ?? null, error: json.error?.message ?? null };
  } catch {
    return { data: null, error: "Network error. Check your connection." };
  }
}
