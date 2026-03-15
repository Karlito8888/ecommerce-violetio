/**
 * Cart Server Functions — TanStack Start server-side cart CRUD.
 *
 * ## Architecture overview
 *
 * These Server Functions form the **security boundary** between the browser and the
 * Violet API. The Violet token never reaches the client — it lives exclusively in
 * the server-side `VioletAdapter` singleton (via `getAdapter()`).
 *
 * Each mutation follows the same three-step pattern:
 * 1. Call the `VioletAdapter` → creates/modifies the Violet cart
 * 2. Upsert the Supabase `carts` row → links Violet cart ID to our DB
 * 3. Return the merged Cart (Supabase UUID + Violet data) to the client
 *
 * ## Cart ownership model (Violet + Supabase)
 *
 * Every cart row must satisfy `CONSTRAINT carts_has_owner`:
 * - Authenticated user: `user_id = user.id`, `session_id = null`
 * - Anonymous user:     `user_id = null`,    `session_id = user.id`
 *
 * The client reads the Supabase session and passes `userId`/`sessionId` in the
 * request body. We trust these values because Server Functions run in a sandboxed
 * Node.js context with no direct DB access from the client — but the Supabase RLS
 * policies enforce ownership on the DB side regardless.
 *
 * ## Cart ID persistence
 *
 * After Violet cart creation, `createCartFn` sets an **HttpOnly cookie**
 * (`violet_cart_id`, 30 days). The root route loader reads this cookie server-side
 * via `getCartCookieFn` to hydrate `CartProvider` on every page load/refresh —
 * preserving the cart badge count without a client-side round-trip.
 *
 * ## Violet 200-with-errors pattern
 *
 * Violet returns HTTP 200 even when items have errors (e.g., out of stock).
 * The adapter's `parseAndTransformCart()` extracts `errors` from each bag.
 * The Cart returned here may have `bags[n].errors.length > 0` — the UI is
 * responsible for displaying these per-bag errors (not global toast).
 *
 * @see packages/shared/src/adapters/violetAdapter.ts — cart methods + parseAndTransformCart
 * @see apps/web/src/server/supabaseServer.ts — service-role Supabase client
 * @see apps/web/src/routes/__root.tsx — root loader reading the cookie
 * @see https://docs.violet.io/api-reference/checkout/cart
 */

import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import type { ApiResponse, Cart, CartItemInput, CreateCartInput } from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";
import { getSupabaseServer } from "./supabaseServer";

// ─── Helper: persist/retrieve Supabase cart row ─────────────────────────────

/**
 * Looks up a Supabase cart row by Violet cart ID.
 * Returns the Supabase cart UUID, or null if not found.
 */
async function getSupabaseCartId(violetCartId: string): Promise<string | null> {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("carts")
    .select("id")
    .eq("violet_cart_id", violetCartId)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Upserts a Supabase cart row and returns its UUID.
 * Creates the row if it doesn't exist; updates `updated_at` if it does.
 */
async function upsertSupabaseCart(
  violetCartId: string,
  input: CreateCartInput,
): Promise<string | null> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("carts")
    .upsert(
      {
        violet_cart_id: violetCartId,
        user_id: input.userId,
        session_id: input.sessionId,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "violet_cart_id" },
    )
    .select("id")
    .single();

  if (error || !data) return null;
  return data.id;
}

/**
 * Merges Supabase cart UUID into the Violet Cart response.
 * The adapter returns `id: ""` — the Server Function fills it in after DB upsert.
 */
function withSupabaseId(cart: Cart, supabaseCartId: string): Cart {
  return { ...cart, id: supabaseCartId };
}

// ─── Server Functions ────────────────────────────────────────────────────────

/**
 * Creates a new Violet cart and persists it to Supabase.
 * Sets `violet_cart_id` HttpOnly cookie on the response.
 */
export const createCartFn = createServerFn({ method: "POST" })
  .inputValidator((input: CreateCartInput) => input)
  .handler(async ({ data: input }): Promise<ApiResponse<Cart>> => {
    const adapter = getAdapter();
    const result = await adapter.createCart(input);
    if (result.error) return result;

    const violetCartId = result.data.violetCartId;

    // Persist to Supabase
    const supabaseCartId = await upsertSupabaseCart(violetCartId, input);
    if (!supabaseCartId) {
      return {
        data: null,
        error: { code: "DB.CART_PERSIST_FAILED", message: "Failed to persist cart to database" },
      };
    }

    // Set HttpOnly cookie — persists cart ID across page loads
    setCookie("violet_cart_id", violetCartId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return { data: withSupabaseId(result.data, supabaseCartId), error: null };
  });

/**
 * Adds a SKU to an existing cart (or creates a new one if none exists).
 * Reads the violet_cart_id from HttpOnly cookie.
 * Also upserts product info (name, thumbnail) into cart_items for display.
 */
export const addToCartFn = createServerFn({ method: "POST" })
  .inputValidator(
    (
      input: CartItemInput & {
        violetCartId: string;
        userId?: string | null;
        sessionId?: string | null;
      },
    ) => input,
  )
  .handler(async ({ data }): Promise<ApiResponse<Cart>> => {
    const adapter = getAdapter();
    const { violetCartId, userId = null, sessionId = null, ...item } = data;

    const result = await adapter.addToCart(violetCartId, {
      skuId: item.skuId,
      quantity: item.quantity,
    });
    if (result.error) return result;

    // Ensure Supabase row exists
    let supabaseCartId = await getSupabaseCartId(violetCartId);
    if (!supabaseCartId) {
      supabaseCartId = await upsertSupabaseCart(violetCartId, { userId, sessionId });
    }
    if (!supabaseCartId) {
      return {
        data: null,
        error: { code: "DB.CART_PERSIST_FAILED", message: "Failed to persist cart to database" },
      };
    }

    // Store product info in cart_items for name/thumbnail display at get-cart time.
    // Find the unit_price from the returned cart (Violet assigns prices server-side).
    const addedItem = result.data.bags.flatMap((b) => b.items).find((i) => i.skuId === item.skuId);

    // Persist product info (name, thumbnail) for display at get-cart time.
    // Violet's GET /checkout/cart/{id} returns only sku_id + price — no product metadata.
    // We store it here and look it up in getCartFn via a secondary Supabase query.
    const supabase = getSupabaseServer();
    const { error: itemUpsertError } = await supabase.from("cart_items").upsert(
      {
        cart_id: supabaseCartId,
        sku_id: item.skuId,
        quantity: item.quantity,
        unit_price: addedItem?.unitPrice ?? 0,
        product_name: item.productName ?? null,
        thumbnail_url: item.thumbnailUrl ?? null,
      },
      { onConflict: "cart_id, sku_id" },
    );
    // Non-fatal: product name/thumbnail won't display but cart still works.
    // Most likely cause: migration 20260315000000_cart_items_product_info.sql not applied.
    if (itemUpsertError) {
      // eslint-disable-next-line no-console
      console.warn(
        "[cart_items] upsert failed — product info will not display:",
        itemUpsertError.message,
      );
    }

    return { data: withSupabaseId(result.data, supabaseCartId), error: null };
  });

/**
 * Updates the quantity of a cart item.
 *
 * Also syncs the new quantity to Supabase `cart_items` to prevent stale data.
 * Without this sync, if a user updates qty and then re-adds the same SKU on another
 * device, the old quantity would overwrite the correct one during the upsert.
 */
export const updateCartItemFn = createServerFn({ method: "POST" })
  .inputValidator((input: { violetCartId: string; skuId: string; quantity: number }) => input)
  .handler(async ({ data }): Promise<ApiResponse<Cart>> => {
    const adapter = getAdapter();
    const result = await adapter.updateCartItem(data.violetCartId, data.skuId, data.quantity);
    if (result.error) return result;

    const supabaseCartId = await getSupabaseCartId(data.violetCartId);
    if (!supabaseCartId) {
      return {
        data: null,
        error: { code: "DB.CART_NOT_FOUND", message: "Cart not found in database" },
      };
    }

    // Sync quantity to cart_items — row may not exist (e.g., added before migration).
    // update() is a no-op if the row is absent, which is acceptable.
    const supabase = getSupabaseServer();
    await supabase
      .from("cart_items")
      .update({ quantity: data.quantity })
      .eq("cart_id", supabaseCartId)
      .eq("sku_id", data.skuId);

    // Touch carts row so Supabase Realtime fires for cross-device sync (Story 4.6).
    // The updated_at trigger auto-updates the timestamp on any row modification.
    await supabase
      .from("carts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", supabaseCartId);

    return { data: withSupabaseId(result.data, supabaseCartId), error: null };
  });

/**
 * Removes a SKU from the cart.
 *
 * Also deletes the corresponding `cart_items` row to prevent orphan accumulation.
 * Without this cleanup, removed items linger in cart_items indefinitely — the table
 * grows unbounded and Supabase bandwidth is wasted on every getCartFn query.
 */
export const removeFromCartFn = createServerFn({ method: "POST" })
  .inputValidator((input: { violetCartId: string; skuId: string }) => input)
  .handler(async ({ data }): Promise<ApiResponse<Cart>> => {
    const adapter = getAdapter();
    const result = await adapter.removeFromCart(data.violetCartId, data.skuId);
    if (result.error) return result;

    const supabaseCartId = await getSupabaseCartId(data.violetCartId);
    if (!supabaseCartId) {
      return {
        data: null,
        error: { code: "DB.CART_NOT_FOUND", message: "Cart not found in database" },
      };
    }

    // Clean up product info row — Violet has already removed the item from the cart.
    // Non-fatal: orphan rows don't cause incorrect display (item absent from Violet cart)
    // but would cause the cart_items table to grow unbounded.
    const supabase = getSupabaseServer();
    await supabase
      .from("cart_items")
      .delete()
      .eq("cart_id", supabaseCartId)
      .eq("sku_id", data.skuId);

    // Touch carts row so Supabase Realtime fires for cross-device sync (Story 4.6).
    await supabase
      .from("carts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", supabaseCartId);

    return { data: withSupabaseId(result.data, supabaseCartId), error: null };
  });

/**
 * Fetches the current cart state, enriched with product names and thumbnails
 * from Supabase cart_items (stored at add-to-cart time).
 */
export const getCartFn = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(async ({ data: violetCartId }): Promise<ApiResponse<Cart>> => {
    const adapter = getAdapter();
    const result = await adapter.getCart(violetCartId);
    if (result.error) return result;

    const supabaseCartId = await getSupabaseCartId(violetCartId);
    if (!supabaseCartId) {
      return {
        data: null,
        error: { code: "DB.CART_NOT_FOUND", message: "Cart not found in database" },
      };
    }

    // Enrich cart items with product names/thumbnails from Supabase cart_items
    const supabase = getSupabaseServer();
    const { data: storedItems } = await supabase
      .from("cart_items")
      .select("sku_id, product_name, thumbnail_url")
      .eq("cart_id", supabaseCartId);

    const productInfoMap: Record<string, { name: string | null; thumbnailUrl: string | null }> = {};
    for (const row of storedItems ?? []) {
      productInfoMap[row.sku_id] = {
        name: row.product_name,
        thumbnailUrl: row.thumbnail_url,
      };
    }

    const enrichedCart: Cart = {
      ...result.data,
      id: supabaseCartId,
      bags: result.data.bags.map((bag) => ({
        ...bag,
        items: bag.items.map((item) => ({
          ...item,
          name: productInfoMap[item.skuId]?.name ?? undefined,
          thumbnailUrl: productInfoMap[item.skuId]?.thumbnailUrl ?? undefined,
        })),
      })),
    };

    return { data: enrichedCart, error: null };
  });

/**
 * Reads the violet_cart_id from the HttpOnly cookie.
 * Called server-side during root hydration to initialize CartContext.
 */
export const getCartCookieFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ violetCartId: string | null }> => {
    const violetCartId = getCookie("violet_cart_id") ?? null;
    return { violetCartId };
  },
);
