/**
 * Violet shipping operations: setShippingAddress, getAvailableShippingMethods,
 * setShippingMethods, priceCart.
 */

import type {
  ApiResponse,
  Cart,
  ShippingAddressInput,
  ShippingMethodsAvailable,
  SetShippingMethodInput,
} from "../types/index.js";
import { violetShippingAvailableResponseSchema } from "../schemas/index.js";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";
import { parseAndTransformCart } from "./violetCartTransforms.js";

/**
 * Sets the shipping address for a Violet cart.
 *
 * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-address
 */
export async function setShippingAddress(
  ctx: CatalogContext,
  violetCartId: string,
  address: ShippingAddressInput,
): Promise<ApiResponse<void>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}/shipping_address`,
    {
      method: "POST",
      body: JSON.stringify({
        address_1: address.address1,
        city: address.city,
        state: address.state,
        postal_code: address.postalCode,
        country: address.country,
        phone: address.phone,
      }),
    },
    ctx.tokenManager,
  );
  if (result.error) return { data: null, error: result.error };
  return { data: undefined, error: null };
}

/**
 * Fetches available shipping methods for all bags in the cart.
 *
 * @see https://docs.violet.io/api-reference/checkout/cart/get-available-shipping-methods
 */
export async function getAvailableShippingMethods(
  ctx: CatalogContext,
  violetCartId: string,
): Promise<ApiResponse<ShippingMethodsAvailable[]>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}/shipping/available`,
    { method: "GET" },
    ctx.tokenManager,
  );
  if (result.error) return { data: null, error: result.error };

  const parsed = violetShippingAvailableResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return {
      data: null,
      error: {
        code: "VIOLET.VALIDATION_ERROR",
        message: `Invalid shipping/available response: ${parsed.error.message}`,
      },
    };
  }

  return {
    data: parsed.data.map((item) => ({
      bagId: String(item.bag_id),
      shippingMethods: item.shipping_methods.map((m) => ({
        id: m.shipping_method_id,
        label: m.label,
        carrier: m.carrier,
        minDays: m.min_days,
        maxDays: m.max_days,
        price: m.price,
      })),
    })),
    error: null,
  };
}

/**
 * Applies shipping method selections to a cart and returns the "priced cart".
 *
 * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-methods
 */
export async function setShippingMethods(
  ctx: CatalogContext,
  violetCartId: string,
  selections: SetShippingMethodInput[],
): Promise<ApiResponse<Cart>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}/shipping`,
    {
      method: "POST",
      body: JSON.stringify(
        selections.map((s) => ({
          bag_id: Number(s.bagId),
          shipping_method_id: s.shippingMethodId,
        })),
      ),
    },
    ctx.tokenManager,
  );
  if (result.error) return { data: null, error: result.error };

  return parseAndTransformCart(result.data);
}

/**
 * Prices a cart via GET /checkout/cart/{id}/price.
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-pricing/price-cart
 */
export async function priceCart(
  ctx: CatalogContext,
  violetCartId: string,
): Promise<ApiResponse<Cart>> {
  const result = await fetchWithRetry(
    `${ctx.apiBase}/checkout/cart/${violetCartId}/price`,
    { method: "GET" },
    ctx.tokenManager,
  );
  if (result.error) return { data: null, error: result.error };

  return parseAndTransformCart(result.data);
}
