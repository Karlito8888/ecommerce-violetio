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
 *
 * ## Quick Checkout
 * When `input.skus` and/or `input.customer` are provided, Violet processes
 * everything in a single call, reducing e-commerce API requests from ~8 to ~4.
 * This is the recommended approach per Violet docs for high-traffic scenarios.
 *
 * @see https://docs.violet.io/prism/checkout-guides/guides/utilizing-quick-checkout
 */
export async function createCart(
  ctx: CatalogContext,
  input: CreateCartInput,
): Promise<ApiResponse<Cart>> {
  const appId = getAppId();
  if (!appId) {
    return {
      data: null,
      error: { code: "VIOLET.CONFIG_MISSING", message: "VIOLET_APP_ID not configured" },
    };
  }

  // Build base body — always required
  const body: Record<string, unknown> = {
    channel_id: Number(appId),
    currency: "USD",
    wallet_based_checkout: true,
  };

  // ─── Quick Checkout: add SKUs inline ─────────────────────────────
  // @see https://docs.violet.io/prism/checkout-guides/guides/utilizing-quick-checkout
  if (input.skus && input.skus.length > 0) {
    body.skus = input.skus.map((s) => ({
      sku_id: Number(s.skuId),
      quantity: s.quantity,
    }));
  }

  // ─── Quick Checkout: add customer + address inline ───────────────
  // Consolidates setCustomer + setShippingAddress + setBillingAddress
  // into the create cart call, saving 4 e-commerce API requests.
  if (input.customer) {
    const customer: Record<string, unknown> = {
      first_name: input.customer.firstName,
      last_name: input.customer.lastName,
      email: input.customer.email,
      shipping_address: {
        address_1: input.customer.shippingAddress.address1,
        city: input.customer.shippingAddress.city,
        state: input.customer.shippingAddress.state,
        postal_code: input.customer.shippingAddress.postalCode,
        country: input.customer.shippingAddress.country,
        ...(input.customer.shippingAddress.phone
          ? { phone: input.customer.shippingAddress.phone }
          : {}),
      },
      same_address: input.customer.sameAddress !== false,
    };

    // Billing address (only if different from shipping)
    if (input.customer.billingAddress && input.customer.sameAddress === false) {
      customer.billing_address = {
        address_1: input.customer.billingAddress.address1,
        city: input.customer.billingAddress.city,
        state: input.customer.billingAddress.state,
        postal_code: input.customer.billingAddress.postalCode,
        country: input.customer.billingAddress.country,
      };
    }

    body.customer = customer;
  }

  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart`,
    {
      method: "POST",
      body: JSON.stringify(body),
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
