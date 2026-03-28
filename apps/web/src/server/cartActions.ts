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
import { z } from "zod";
import type { ApiResponse, Cart, CartItemInput, CreateCartInput } from "@ecommerce/shared";
import { cartItemInputSchema, logError } from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";
import { getSupabaseServer } from "./supabaseServer";

// ─── Helper: persist/retrieve Supabase cart row ─────────────────────────────

/**
 * Looks up a Supabase cart row by Violet cart ID.
 * Returns the Supabase cart UUID, or null if not found.
 *
 * Supabase client returns errors in `{ error }` without throwing.
 * Ignoring this property causes database failures to masquerade as
 * "not found" results. We explicitly check and log it.
 */
async function getSupabaseCartId(violetCartId: string): Promise<string | null> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("carts")
    .select("id")
    .eq("violet_cart_id", violetCartId)
    .maybeSingle();

  if (error) {
    logError(supabase, {
      source: "web",
      error_type: "DB.QUERY_FAILED",
      message: `Failed to look up cart by violet_cart_id: ${error.message}`,
      context: { violetCartId, operation: "getSupabaseCartId", code: error.code },
    });
    return null;
  }

  return data?.id ?? null;
}

/**
 * Upserts a Supabase cart row and returns its UUID.
 * Creates the row if it doesn't exist; updates `updated_at` if it does.
 *
 * Supabase client returns errors in `{ error }` without throwing.
 * The specific error message is logged before returning null so that
 * constraint violations, RLS denials, and network failures are visible
 * in the error_logs table for operational debugging.
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

  if (error || !data) {
    logError(supabase, {
      source: "web",
      error_type: "DB.UPSERT_FAILED",
      message: `Failed to upsert cart row: ${error?.message ?? "no data returned"}`,
      context: { violetCartId, operation: "upsertSupabaseCart", code: error?.code },
    });
    return null;
  }
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
 *
 * HttpOnly cookie with Secure flag in production prevents transmission over
 * plain HTTP. SameSite=lax prevents CSRF while allowing top-level navigations.
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
      logError(getSupabaseServer(), {
        source: "web",
        error_type: "DB.CART_PERSIST_FAILED",
        message: "Failed to persist cart to database",
        context: { violetCartId, operation: "createCart" },
        user_id: input.userId ?? undefined,
        session_id: input.sessionId ?? undefined,
      });
      return {
        data: null,
        error: { code: "DB.CART_PERSIST_FAILED", message: "Failed to persist cart to database" },
      };
    }

    /**
     * HttpOnly cookie with Secure flag in production prevents transmission over
     * plain HTTP. SameSite=lax prevents CSRF while allowing top-level navigations.
     */
    setCookie("violet_cart_id", violetCartId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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
 *
 * Runtime input validation prevents malformed client data from reaching
 * Violet/Supabase. TanStack Start server functions are callable from the
 * client — input must be treated as untrusted.
 */
export const addToCartFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    /**
     * Runtime input validation prevents malformed client data from reaching
     * Violet/Supabase. TanStack Start server functions are callable from the
     * client — input must be treated as untrusted.
     */
    const schema = cartItemInputSchema.extend({
      violetCartId: z.string().min(1, "Violet cart ID is required"),
      userId: z.string().nullable().optional(),
      sessionId: z.string().nullable().optional(),
      productName: z.string().optional(),
      thumbnailUrl: z.string().optional(),
    });
    return schema.parse(input) as CartItemInput & {
      violetCartId: string;
      userId?: string | null;
      sessionId?: string | null;
    };
  })
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
    /**
     * Secondary Supabase operations are non-blocking — Violet is the source of truth.
     * Errors are logged for diagnostics but don't fail the request.
     */
    if (itemUpsertError) {
      logError(supabase, {
        source: "web",
        error_type: "DB.CART_ITEMS_UPSERT_FAILED",
        message: `cart_items upsert failed — product info will not display: ${itemUpsertError.message}`,
        context: { supabaseCartId, skuId: item.skuId, operation: "addToCart" },
      });
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
  .inputValidator(
    (input: { violetCartId: string; orderSkuId: string; skuId: string; quantity: number }) => input,
  )
  .handler(async ({ data }): Promise<ApiResponse<Cart>> => {
    const adapter = getAdapter();
    const result = await adapter.updateCartItem(data.violetCartId, data.orderSkuId, data.quantity);
    if (result.error) return result;

    const supabaseCartId = await getSupabaseCartId(data.violetCartId);
    if (!supabaseCartId) {
      /**
       * Log DB.CART_NOT_FOUND for debugging (Code Review Fix — H3).
       * The original implementation returned the error without logging it.
       * Without logging, cart-not-found errors are invisible to the admin dashboard.
       */
      logError(getSupabaseServer(), {
        source: "web",
        error_type: "DB.CART_NOT_FOUND",
        message: "Cart not found in database",
        context: { violetCartId: data.violetCartId, operation: "updateCartItem" },
      });
      return {
        data: null,
        error: { code: "DB.CART_NOT_FOUND", message: "Cart not found in database" },
      };
    }

    /**
     * Secondary Supabase operations are non-blocking — Violet is the source of truth.
     * Errors are logged for diagnostics but don't fail the request.
     */
    const supabase = getSupabaseServer();

    // Sync quantity to cart_items — row may not exist (e.g., added before migration).
    // update() is a no-op if the row is absent, which is acceptable.
    const { error: itemUpdateError } = await supabase
      .from("cart_items")
      .update({ quantity: data.quantity })
      .eq("cart_id", supabaseCartId)
      .eq("sku_id", data.skuId);

    if (itemUpdateError) {
      logError(supabase, {
        source: "web",
        error_type: "DB.CART_ITEMS_UPDATE_FAILED",
        message: `cart_items quantity sync failed: ${itemUpdateError.message}`,
        context: { supabaseCartId, skuId: data.skuId, operation: "updateCartItem" },
      });
    }

    // Touch carts row so Supabase Realtime fires for cross-device sync (Story 4.6).
    // The updated_at trigger auto-updates the timestamp on any row modification.
    const { error: touchError } = await supabase
      .from("carts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", supabaseCartId);

    if (touchError) {
      logError(supabase, {
        source: "web",
        error_type: "DB.CART_TOUCH_FAILED",
        message: `Failed to touch carts.updated_at: ${touchError.message}`,
        context: { supabaseCartId, operation: "updateCartItem" },
      });
    }

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
  .inputValidator((input: { violetCartId: string; orderSkuId: string; skuId: string }) => input)
  .handler(async ({ data }): Promise<ApiResponse<Cart>> => {
    const adapter = getAdapter();
    const result = await adapter.removeFromCart(data.violetCartId, data.orderSkuId);
    if (result.error) return result;

    const supabaseCartId = await getSupabaseCartId(data.violetCartId);
    if (!supabaseCartId) {
      /** Log DB.CART_NOT_FOUND for debugging (Code Review Fix — H3). */
      logError(getSupabaseServer(), {
        source: "web",
        error_type: "DB.CART_NOT_FOUND",
        message: "Cart not found in database",
        context: { violetCartId: data.violetCartId, operation: "removeFromCart" },
      });
      return {
        data: null,
        error: { code: "DB.CART_NOT_FOUND", message: "Cart not found in database" },
      };
    }

    /**
     * Secondary Supabase operations are non-blocking — Violet is the source of truth.
     * Errors are logged for diagnostics but don't fail the request.
     */
    const supabase = getSupabaseServer();

    // Clean up product info row — Violet has already removed the item from the cart.
    // Non-fatal: orphan rows don't cause incorrect display (item absent from Violet cart)
    // but would cause the cart_items table to grow unbounded.
    const { error: itemDeleteError } = await supabase
      .from("cart_items")
      .delete()
      .eq("cart_id", supabaseCartId)
      .eq("sku_id", data.skuId);

    if (itemDeleteError) {
      logError(supabase, {
        source: "web",
        error_type: "DB.CART_ITEMS_DELETE_FAILED",
        message: `cart_items delete failed: ${itemDeleteError.message}`,
        context: { supabaseCartId, skuId: data.skuId, operation: "removeFromCart" },
      });
    }

    // Touch carts row so Supabase Realtime fires for cross-device sync (Story 4.6).
    const { error: touchError } = await supabase
      .from("carts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", supabaseCartId);

    if (touchError) {
      logError(supabase, {
        source: "web",
        error_type: "DB.CART_TOUCH_FAILED",
        message: `Failed to touch carts.updated_at: ${touchError.message}`,
        context: { supabaseCartId, operation: "removeFromCart" },
      });
    }

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
      /** Log DB.CART_NOT_FOUND for debugging (Code Review Fix — H3). */
      logError(getSupabaseServer(), {
        source: "web",
        error_type: "DB.CART_NOT_FOUND",
        message: "Cart not found in database",
        context: { violetCartId, operation: "getCart" },
      });
      return {
        data: null,
        error: { code: "DB.CART_NOT_FOUND", message: "Cart not found in database" },
      };
    }

    // Enrich cart items with product names/thumbnails from Supabase cart_items
    const supabase = getSupabaseServer();
    const { data: storedItems, error: itemsQueryError } = await supabase
      .from("cart_items")
      .select("sku_id, product_name, thumbnail_url")
      .eq("cart_id", supabaseCartId);

    /**
     * Secondary Supabase operations are non-blocking — Violet is the source of truth.
     * Errors are logged for diagnostics but don't fail the request.
     * If the query fails, we proceed without enrichment (items show without names/thumbnails).
     */
    if (itemsQueryError) {
      logError(supabase, {
        source: "web",
        error_type: "DB.CART_ITEMS_QUERY_FAILED",
        message: `cart_items query failed — items will lack product info: ${itemsQueryError.message}`,
        context: { supabaseCartId, operation: "getCart" },
      });
    }

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
