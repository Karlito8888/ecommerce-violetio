/**
 * Violet cart operations: createCart, addToCart, updateCartItem,
 * removeFromCart, getCart.
 */

import type { ApiResponse, Cart, CartItemInput, CreateCartInput } from "../types/index.js";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";
import { parseAndTransformCart, getAppId } from "./violetCartTransforms.js";

/**
 * Creates a new Violet cart via POST /checkout/cart.
 */
export async function createCart(
  ctx: CatalogContext,
  _input: CreateCartInput,
): Promise<ApiResponse<Cart>> {
  const appId = getAppId();
  if (!appId) {
    return {
      data: null,
      error: { code: "VIOLET.CONFIG_MISSING", message: "VIOLET_APP_ID not configured" },
    };
  }

  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart`,
    {
      method: "POST",
      body: JSON.stringify({
        channel_id: Number(appId),
        currency: "USD",
        wallet_based_checkout: true,
      }),
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  return parseAndTransformCart(result.data);
}

/**
 * Adds a SKU to a Violet cart via POST /checkout/cart/{cartId}/skus.
 */
export async function addToCart(
  ctx: CatalogContext,
  violetCartId: string,
  item: CartItemInput,
): Promise<ApiResponse<Cart>> {
  const appId = getAppId();
  if (!appId) {
    return {
      data: null,
      error: { code: "VIOLET.CONFIG_MISSING", message: "VIOLET_APP_ID not configured" },
    };
  }

  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}/skus`,
    {
      method: "POST",
      body: JSON.stringify({
        sku_id: Number(item.skuId),
        quantity: item.quantity,
        app_id: Number(appId),
      }),
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  return parseAndTransformCart(result.data);
}

/**
 * Updates a SKU quantity via PUT /checkout/cart/{cartId}/skus/{skuId}.
 */
export async function updateCartItem(
  ctx: CatalogContext,
  violetCartId: string,
  orderSkuId: string,
  quantity: number,
): Promise<ApiResponse<Cart>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}/skus/${orderSkuId}`,
    {
      method: "PUT",
      body: JSON.stringify({ quantity }),
    },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  return parseAndTransformCart(result.data);
}

/**
 * Removes a SKU from a Violet cart via DELETE /checkout/cart/{cartId}/skus/{skuId}.
 */
export async function removeFromCart(
  ctx: CatalogContext,
  violetCartId: string,
  orderSkuId: string,
): Promise<ApiResponse<Cart>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}/skus/${orderSkuId}`,
    { method: "DELETE" },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  return parseAndTransformCart(result.data);
}

/**
 * Fetches current cart state via GET /checkout/cart/{cartId}.
 */
export async function getCart(
  ctx: CatalogContext,
  violetCartId: string,
): Promise<ApiResponse<Cart>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}`,
    { method: "GET" },
    ctx.tokenManager,
  );

  if (result.error) return { data: null, error: result.error };

  return parseAndTransformCart(result.data);
}
