/**
 * Edge Function: cart
 *
 * Proxies Violet cart API calls for the mobile app, keeping the Violet token
 * server-side. Also persists cart state to Supabase after each mutation.
 *
 * ## Routes (matched by method + URL path suffix)
 *
 * | Method | Path                          | Action                      |
 * |--------|-------------------------------|-----------------------------|
 * | POST   | /cart                         | Create cart                 |
 * | POST   | /cart/{id}/skus               | Add SKU                     |
 * | PUT    | /cart/{id}/skus/{skuId}       | Update qty                  |
 * | DELETE | /cart/{id}/skus/{skuId}       | Remove SKU                  |
 * | GET    | /cart/{id}                    | Fetch cart                  |
 * | POST   | /cart/{id}/shipping_address   | Set shipping address        |
 * | GET    | /cart/{id}/shipping/available | Get available shipping      |
 * | POST   | /cart/{id}/shipping           | Set shipping methods        |
 * | POST   | /cart/{id}/customer           | Set guest customer info     |
 * | POST   | /cart/{id}/billing_address    | Set billing address         |
 * | POST   | /cart/{id}/submit             | Submit order                |
 * | GET    | /orders/{orderId}             | Fetch order details         |
 * | GET    | /cart/user                    | Get user's active cart      |
 * | POST   | /cart/merge                   | Merge anonymous→auth cart   |
 * | POST   | /cart/claim                   | Claim anonymous cart        |
 *
 * ## Authentication
 *
 * Requires a valid Supabase user JWT in `Authorization: Bearer <token>`.
 * The JWT is validated before any Violet API call is made.
 * The Violet token is never exposed to mobile clients.
 *
 * ## Shipping route ordering (important)
 *
 * The `/shipping_address` route MUST be matched before `/shipping` to avoid
 * incorrect routing. Both end with "shipping" as a substring.
 * Order: shipping_address → shipping/available → shipping
 *
 * ## Data transformation for shipping routes
 *
 * Cart routes (create, add SKU, etc.) return Violet's raw JSON directly to mobile.
 * Shipping routes MUST transform before returning:
 * - GET /shipping/available: Violet returns snake_case → must transform to ShippingMethodsAvailable[]
 *   (see transformShippingAvailable). Web uses VioletAdapter which does this via Zod.
 * - POST /shipping: returns cart data → transformed via transformCart() (same as other cart routes).
 * - POST /shipping_address: returns 200 with no body needed → return empty 200.
 *
 * ## Violet best practices applied here
 * - Never expose Violet JWT to the mobile client (Authorization header only on server side)
 * - Set shipping address BEFORE calling /shipping/available (Violet prerequisite)
 * - /shipping/available is slow (2–5s, calls carrier APIs) — mobile must show loading state
 * - POST /shipping body: `[{ bag_id: number, shipping_method_id: string }]` — one per bag
 * - POST /shipping response is a "priced cart" (shipping_total per bag updated)
 *
 * @see supabase/functions/_shared/violetAuth.ts — getVioletHeaders()
 * @see supabase/functions/_shared/supabaseAdmin.ts — getSupabaseAdmin()
 * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-address
 * @see https://docs.violet.io/api-reference/checkout/cart/get-available-shipping-methods
 * @see https://docs.violet.io/api-reference/checkout/cart/set-shipping-methods
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { violetFetch } from "../_shared/fetchWithRetry.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const VIOLET_API_BASE = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return json({ data: null, error: { code, message } }, status);
}

/**
 * Fire-and-forget error logging to Supabase error_logs table (Story 4.7).
 * Uses console.error as fallback if Supabase insert fails, ensuring
 * diagnostic info is preserved in Deno runtime logs.
 */
async function logEdgeFunctionError(
  source: string,
  message: string,
  context?: Record<string, unknown>,
  userId?: string,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("error_logs").insert({
      source: "edge-function",
      error_type: source,
      message,
      context,
      user_id: userId ?? null,
    });
  } catch (err) {
    console.error("[edge-fn] Failed to log error:", err, "— Original:", {
      source,
      errorType: source,
      message,
    });
  }
}

/** Validated user result — either a userId or a typed error. */
type ValidateUserResult =
  | { userId: string }
  | { error: "NO_AUTH_HEADER" | "INVALID_TOKEN" | "AUTH_SERVICE_ERROR" };

/**
 * Validates the caller's Supabase JWT and returns the user ID or a typed error.
 *
 * Three failure modes:
 * - `NO_AUTH_HEADER`: Missing or malformed Authorization header (client bug).
 * - `INVALID_TOKEN`: JWT present but rejected by Supabase Auth (expired/tampered).
 * - `AUTH_SERVICE_ERROR`: Supabase Auth service itself failed (transient outage).
 */
async function validateUser(req: Request): Promise<ValidateUserResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "NO_AUTH_HEADER" };

  const jwt = authHeader.slice(7);
  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase.auth.getUser(jwt);
    if (error) return { error: "INVALID_TOKEN" };
    if (!data.user) return { error: "INVALID_TOKEN" };
    return { userId: data.user.id };
  } catch {
    return { error: "AUTH_SERVICE_ERROR" };
  }
}

/**
 * Upserts product info into cart_items for name/thumbnail display at get-cart time.
 *
 * Violet's cart API returns only sku_id + price in bag items — no product metadata.
 * We store product name and thumbnail at add-to-cart time so getCartFn can enrich
 * the response without calling the catalog API again.
 *
 * Logs a warning on failure (non-fatal: cart functions correctly, just without
 * product names/thumbnails).
 */
async function upsertCartItem(
  cartId: string,
  skuId: string,
  quantity: number,
  unitPrice: number,
  productName: string | null,
  thumbnailUrl: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("cart_items").upsert(
    {
      cart_id: cartId,
      sku_id: String(skuId),
      quantity,
      unit_price: unitPrice,
      product_name: productName,
      thumbnail_url: thumbnailUrl,
    },
    { onConflict: "cart_id, sku_id" },
  );
  if (error) {
    console.warn("[cart_items] upsert failed — product info will not display:", error.message);
  }
}

/**
 * Deletes a cart_items row when an item is removed from the Violet cart.
 *
 * Without this cleanup, removed items accumulate as orphan rows in cart_items.
 * They don't cause incorrect display (Violet is the source of truth for cart contents)
 * but grow the table unbounded and waste Supabase bandwidth on every getCartFn query.
 */
async function deleteCartItem(cartId: string, skuId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("cart_items").delete().eq("cart_id", cartId).eq("sku_id", String(skuId));
}

/**
 * Fetches product info map from cart_items for a given cart UUID.
 *
 * Graceful degradation: if the Supabase query fails, returns an empty map.
 * Product names and thumbnails are cosmetic — the cart functions correctly
 * without them; items simply render without display metadata.
 */
async function getProductInfoMap(
  cartId: string,
): Promise<Record<string, { name: string | null; thumbnailUrl: string | null }>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("cart_items")
    .select("sku_id, product_name, thumbnail_url")
    .eq("cart_id", cartId);

  if (error) {
    logEdgeFunctionError(
      "SUPABASE.QUERY_ERROR",
      `Failed to fetch product info for cart ${cartId}: ${error.message}`,
      { cartId, table: "cart_items" },
    );
    return {};
  }

  const map: Record<string, { name: string | null; thumbnailUrl: string | null }> = {};
  for (const row of data ?? []) {
    map[row.sku_id] = { name: row.product_name, thumbnailUrl: row.thumbnail_url };
  }
  return map;
}

/**
 * Upserts a cart row in Supabase and returns the Supabase cart UUID.
 *
 * Returns `null` on failure. Callers should still return cart data to the
 * client but set `id: null` and include a warning — the Violet cart is
 * functional, only Supabase persistence failed. The error is logged so
 * ops can investigate without blocking the user's checkout flow.
 */
async function upsertCart(violetCartId: string, userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("carts")
    .upsert(
      {
        violet_cart_id: violetCartId,
        user_id: userId,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "violet_cart_id" },
    )
    .select("id")
    .single();

  if (error) {
    logEdgeFunctionError(
      "SUPABASE.UPSERT_ERROR",
      `Cart upsert failed for violet_cart_id=${violetCartId}: ${error.message}`,
      { violetCartId, userId },
      userId,
    );
    return null;
  }
  if (!data) return null;
  return data.id;
}

Deno.serve(async (req: Request) => {
  // ── CORS preflight ─────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth gate ──────────────────────────────────────────────────────
  const authResult = await validateUser(req);
  if ("error" in authResult) {
    const messages: Record<string, string> = {
      NO_AUTH_HEADER: "Missing or malformed Authorization header",
      INVALID_TOKEN: "Invalid or expired Supabase JWT",
      AUTH_SERVICE_ERROR: "Authentication service unavailable — try again later",
    };
    const status = authResult.error === "AUTH_SERVICE_ERROR" ? 503 : 401;
    return errorResponse(`AUTH.${authResult.error}`, messages[authResult.error], status);
  }
  const userId = authResult.userId;

  const url = new URL(req.url);
  // Path after /functions/v1/cart
  const path = url.pathname.replace(/.*\/cart/, "");
  const appId = Deno.env.get("VIOLET_APP_ID");

  // ── Route: POST /cart — create cart (supports Quick Checkout) ──────
  if (req.method === "POST" && (path === "" || path === "/")) {
    if (!appId) return errorResponse("VIOLET.CONFIG_MISSING", "VIOLET_APP_ID not configured", 500);

    // Parse request body for Quick Checkout fields
    let requestBody: Record<string, unknown> = {};
    try {
      requestBody = await req.json();
    } catch {
      // Empty body — standard cart creation
    }

    /**
     * `wallet_based_checkout: true` — Violet creates a Stripe PaymentIntent at cart
     * creation time. Without this, `payment_intent_client_secret` is absent from
     * cart responses, breaking the Stripe PaymentElement/PaymentSheet flow.
     *
     * ## Quick Checkout
     * When `skus` and/or `customer` are provided in the request body, Violet processes
     * everything in a single call, reducing e-commerce API requests from ~8 to ~4.
     *
     * @see https://docs.violet.io/guides/checkout/payments — wallet-based checkout
     * @see https://docs.violet.io/prism/checkout-guides/guides/utilizing-quick-checkout
     * @see Story 4.4 AC#5, AC#12
     */
    const violetBody: Record<string, unknown> = {
      channel_id: Number(appId),
      currency: "USD",
      wallet_based_checkout: true,
    };

    // Quick Checkout: pass through SKUs
    if (requestBody.skus && Array.isArray(requestBody.skus) && requestBody.skus.length > 0) {
      violetBody.skus = requestBody.skus;
    }

    // Quick Checkout: pass through customer + address
    if (requestBody.customer) {
      violetBody.customer = requestBody.customer;
    }

    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart`, {
      method: "POST",
      body: JSON.stringify(violetBody),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      /** Log Violet API error (Code Review Fix — M2). */
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Cart creation failed (${res.status}): ${text}`,
        { route: "POST /cart", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Cart creation failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const violetCartId = String(cartData.id);
    const supabaseCartId = await upsertCart(violetCartId, userId);

    const warning =
      supabaseCartId === null
        ? "Cart persistence failed — cart state may not sync across devices"
        : undefined;
    return json({
      data: {
        id: supabaseCartId,
        violetCartId,
        bags: [],
        total: 0,
        currency: "USD",
        status: "active",
      },
      error: null,
      warning,
    });
  }

  // ── Route: GET /cart/user — get authenticated user's active cart (Story 4.6) ──
  // MUST be before GET /cart/{id} to avoid matching "user" as a cart ID
  if (req.method === "GET" && path === "/user") {
    const supabase = getSupabaseAdmin();
    const { data: userCart } = await supabase
      .from("carts")
      .select("violet_cart_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return json({ violetCartId: userCart?.violet_cart_id ?? null });
  }

  // ── Route: POST /cart/claim — transfer anonymous cart ownership (Story 4.6) ──
  // MUST be before POST /cart/{id}/skus to avoid matching "claim" as a cart ID
  if (req.method === "POST" && path === "/claim") {
    const claimBody = await req.json();
    const claimVioletCartId = claimBody.violetCartId;
    if (!claimVioletCartId) {
      return errorResponse("CART.MISSING_CART_ID", "violetCartId is required", 400);
    }

    // Only claim carts with no owner (anonymous) — prevents cart theft via sequential ID guessing
    const supabase = getSupabaseAdmin();
    const { error: claimError } = await supabase
      .from("carts")
      .update({ user_id: userId, session_id: null })
      .eq("violet_cart_id", claimVioletCartId)
      .is("user_id", null);

    if (claimError) {
      return errorResponse("CART.CLAIM_FAILED", `Failed to claim cart: ${claimError.message}`, 500);
    }
    return json({ success: true });
  }

  // ── Route: POST /cart/merge — merge anonymous cart into authenticated (Story 4.6) ──
  // MUST be before POST /cart/{id}/skus to avoid matching "merge" as a cart ID
  if (req.method === "POST" && path === "/merge") {
    const mergeBody = await req.json();
    const anonymousVioletCartId = mergeBody.anonymousVioletCartId;
    const mergeTargetVioletCartId = mergeBody.targetVioletCartId;
    if (!anonymousVioletCartId || !mergeTargetVioletCartId) {
      return errorResponse(
        "CART.MISSING_PARAMS",
        "anonymousVioletCartId and targetVioletCartId are required",
        400,
      );
    }

    // Fetch both carts from Violet
    const [anonRes, targetRes] = await Promise.all([
      violetFetch(`${VIOLET_API_BASE}/checkout/cart/${anonymousVioletCartId}`, {
        method: "GET",
      }),
      violetFetch(`${VIOLET_API_BASE}/checkout/cart/${mergeTargetVioletCartId}`, {
        method: "GET",
      }),
    ]);

    if (!anonRes.ok) {
      return errorResponse("CART.FETCH_FAILED", "Failed to fetch anonymous cart", 500);
    }
    if (!targetRes.ok) {
      return errorResponse("CART.FETCH_FAILED", "Failed to fetch target cart", 500);
    }

    const anonCart = transformCart(await anonRes.json());
    const targetCart = transformCart(await targetRes.json());

    if (!anonCart) {
      return errorResponse("CART.INVALID_RESPONSE", "Anonymous cart data is invalid", 502);
    }
    if (!targetCart) {
      return errorResponse("CART.INVALID_RESPONSE", "Target cart data is invalid", 502);
    }

    // Extract typed bag/item arrays from transformed carts
    type MergeBag = { items: Array<{ skuId: string; quantity: number }> };
    const anonBags = (anonCart.bags ?? []) as MergeBag[];
    const targetBags = (targetCart.bags ?? []) as MergeBag[];

    // Build map of existing SKUs in target
    const existingSkus = new Map<string, number>();
    for (const bag of targetBags) {
      for (const item of bag.items) {
        existingSkus.set(item.skuId, item.quantity);
      }
    }

    // Merge items: add new SKUs or increase quantity for existing ones
    const mergeErrors: string[] = [];
    let mergedCount = 0;
    for (const bag of anonBags) {
      for (const item of bag.items) {
        const skuId = item.skuId;
        const qty = item.quantity;
        const existingQty = existingSkus.get(skuId);

        if (existingQty !== undefined) {
          const mergeRes = await violetFetch(
            `${VIOLET_API_BASE}/checkout/cart/${mergeTargetVioletCartId}/skus/${skuId}`,
            {
              method: "PUT",
              body: JSON.stringify({ quantity: existingQty + qty }),
            },
          );
          if (!mergeRes.ok) mergeErrors.push(`Failed to update qty for SKU ${skuId}`);
          else mergedCount++;
        } else {
          const mergeRes = await violetFetch(
            `${VIOLET_API_BASE}/checkout/cart/${mergeTargetVioletCartId}/skus`,
            {
              method: "POST",
              body: JSON.stringify({
                sku_id: skuId,
                quantity: qty,
                app_id: Number(appId),
              }),
            },
          );
          if (!mergeRes.ok) mergeErrors.push(`Failed to add SKU ${skuId}`);
          else mergedCount++;
        }
      }
    }

    // Only mark anonymous cart as merged if at least one item was transferred.
    // If all items failed, keep the anonymous cart active so the user can retry.
    const mergeSupa = getSupabaseAdmin();
    if (mergedCount > 0) {
      await mergeSupa
        .from("carts")
        .update({ status: "merged" })
        .eq("violet_cart_id", anonymousVioletCartId);
    }

    // Touch the target cart so Realtime fires
    await upsertCart(mergeTargetVioletCartId, userId);

    return json({
      success: mergedCount > 0,
      targetVioletCartId: mergeTargetVioletCartId,
      mergedItemCount: mergedCount,
      errors: mergeErrors.length > 0 ? mergeErrors : undefined,
    });
  }

  // ── Route: GET /cart/{id} — fetch cart ────────────────────────────
  const getMatch = path.match(/^\/([^/]+)$/);
  if (req.method === "GET" && getMatch) {
    const violetCartId = getMatch[1];
    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}`, {
      method: "GET",
    });

    if (!res.ok) {
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Fetch cart failed (${res.status})`,
        { violetCartId, route: "GET /cart/{id}", httpStatus: res.status },
        userId,
      );
      return errorResponse("VIOLET.API_ERROR", `Fetch cart failed (${res.status})`, res.status);
    }

    const cartData = await res.json();
    const transformed = transformCart(cartData);

    if (!transformed) {
      return errorResponse("CART.INVALID_RESPONSE", "Violet returned invalid cart data", 502);
    }

    /**
     * GET is read-only. Cart persistence happens during mutations (create,
     * add item, update, etc). Calling upsert on GET caused unnecessary
     * writes and spurious Realtime events.
     */
    // Look up existing Supabase cart (read-only, no upsert)
    const supabase = getSupabaseAdmin();
    const { data: existingCart } = await supabase
      .from("carts")
      .select("id")
      .eq("violet_cart_id", violetCartId)
      .maybeSingle();
    const supabaseCartId = existingCart?.id ?? null;

    // Enrich items with product names/thumbnails from Supabase cart_items
    if (supabaseCartId) {
      const productInfoMap = await getProductInfoMap(supabaseCartId);
      const enrichedBags = (transformed.bags as Array<Record<string, unknown>>).map((bag) => ({
        ...bag,
        items: (bag.items as Array<Record<string, unknown>>).map((item) => ({
          ...item,
          name: productInfoMap[item.skuId as string]?.name ?? undefined,
          thumbnailUrl: productInfoMap[item.skuId as string]?.thumbnailUrl ?? undefined,
        })),
      }));
      return json({
        data: { ...transformed, id: supabaseCartId, bags: enrichedBags },
        error: null,
      });
    }

    return json({ data: { ...transformed, id: null }, error: null });
  }

  // ── Route: POST /cart/{id}/skus — add SKU ─────────────────────────
  const addSkuMatch = path.match(/^\/([^/]+)\/skus$/);
  if (req.method === "POST" && addSkuMatch) {
    const violetCartId = addSkuMatch[1];
    const body = await req.json();
    if (!appId) return errorResponse("VIOLET.CONFIG_MISSING", "VIOLET_APP_ID not configured", 500);

    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/skus`, {
      method: "POST",
      body: JSON.stringify({
        sku_id: body.sku_id,
        quantity: body.quantity ?? 1,
        app_id: Number(appId),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      /** Log Violet API error (Code Review Fix — M2). */
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Add SKU failed (${res.status}): ${text}`,
        { violetCartId, route: "POST /cart/{id}/skus", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Add SKU failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const transformed = transformCart(cartData);

    if (!transformed) {
      return errorResponse("CART.INVALID_RESPONSE", "Violet returned invalid cart data", 502);
    }

    const supabaseCartId = await upsertCart(violetCartId, userId);

    // Store product info for name/thumbnail display at get-cart time
    if (supabaseCartId) {
      const addedItem = (transformed.bags as Array<Record<string, unknown>>)
        .flatMap((b) => b.items as Array<Record<string, unknown>>)
        .find((i) => String(i.skuId) === String(body.sku_id));

      await upsertCartItem(
        supabaseCartId,
        String(body.sku_id),
        body.quantity ?? 1,
        (addedItem?.unitPrice as number) ?? 0,
        body.productName ?? null,
        body.thumbnailUrl ?? null,
      );
    }

    const warning =
      supabaseCartId === null
        ? "Cart persistence failed — cart state may not sync across devices"
        : undefined;
    return json({ data: { ...transformed, id: supabaseCartId }, error: null, warning });
  }

  // ── Route: PUT /cart/{id}/skus/{skuId} — update qty ───────────────
  const updateSkuMatch = path.match(/^\/([^/]+)\/skus\/([^/]+)$/);
  if (req.method === "PUT" && updateSkuMatch) {
    const [, violetCartId, skuId] = updateSkuMatch;
    const body = await req.json();

    /**
     * Resolve catalog SKU ID → Violet OrderSku ID.
     *
     * Mobile sends the catalog sku_id (e.g. 356505) but Violet's
     * PUT/DELETE /checkout/cart/{id}/skus/{orderSkuId} expects the
     * OrderSku.id (the per-cart line item ID, e.g. 275930).
     *
     * We fetch the cart first and find the matching OrderSku ID
     * by matching the catalog sku_id in the cart's bag items.
     *
     * @see Bug #6 (web fix) — same issue in VioletAdapter on web.
     */
    let orderSkuId = skuId; // default: assume caller sent the right ID
    try {
      const cartRes = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}`, {
        method: "GET",
      });
      if (cartRes.ok) {
        const cartRaw = await cartRes.json();
        const cartBags = Array.isArray(cartRaw.bags) ? cartRaw.bags : [];
        for (const bag of cartBags) {
          const bagSkus = Array.isArray(bag.skus) ? bag.skus : [];
          for (const s of bagSkus) {
            if (String(s.sku_id) === String(skuId)) {
              orderSkuId = String(s.id);
              break;
            }
          }
          if (orderSkuId !== skuId) break;
        }
      }
    } catch {
      // Fall through — try with the original skuId
    }

    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/skus/${orderSkuId}`, {
      method: "PUT",
      body: JSON.stringify({ quantity: body.quantity }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      /** Log Violet API error (Code Review Fix — M2). */
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Update SKU failed (${res.status}): ${text}`,
        { violetCartId, skuId, route: "PUT /cart/{id}/skus/{skuId}", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Update SKU failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const transformed = transformCart(cartData);
    if (!transformed) {
      return errorResponse("CART.INVALID_RESPONSE", "Violet returned invalid cart data", 502);
    }
    const supabaseCartId = await upsertCart(violetCartId, userId);
    const warning =
      supabaseCartId === null
        ? "Cart persistence failed — cart state may not sync across devices"
        : undefined;
    return json({ data: { ...transformed, id: supabaseCartId }, error: null, warning });
  }

  // ── Route: DELETE /cart/{id}/skus/{skuId} — remove SKU ────────────
  if (req.method === "DELETE" && updateSkuMatch) {
    const [, violetCartId, skuId] = updateSkuMatch;

    /**
     * Same sku_id → orderSkuId resolution as PUT above.
     * @see Bug #6 — Violet expects OrderSku.id, not catalog sku_id.
     */
    let orderSkuId = skuId;
    try {
      const cartRes = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}`, {
        method: "GET",
      });
      if (cartRes.ok) {
        const cartRaw = await cartRes.json();
        const cartBags = Array.isArray(cartRaw.bags) ? cartRaw.bags : [];
        for (const bag of cartBags) {
          const bagSkus = Array.isArray(bag.skus) ? bag.skus : [];
          for (const s of bagSkus) {
            if (String(s.sku_id) === String(skuId)) {
              orderSkuId = String(s.id);
              break;
            }
          }
          if (orderSkuId !== skuId) break;
        }
      }
    } catch {
      // Fall through — try with the original skuId
    }

    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/skus/${orderSkuId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      /** Log Violet API error (Code Review Fix — M2). */
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Remove SKU failed (${res.status}): ${text}`,
        { violetCartId, skuId, route: "DELETE /cart/{id}/skus/{skuId}", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Remove SKU failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const transformed = transformCart(cartData);
    if (!transformed) {
      return errorResponse("CART.INVALID_RESPONSE", "Violet returned invalid cart data", 502);
    }
    const supabaseCartId = await upsertCart(violetCartId, userId);

    // Clean up orphan row — Violet confirmed removal, so delete from cart_items.
    // Non-fatal: orphan rows don't show incorrect data but accumulate unbounded.
    if (supabaseCartId) {
      await deleteCartItem(supabaseCartId, skuId);
    }

    const warning =
      supabaseCartId === null
        ? "Cart persistence failed — cart state may not sync across devices"
        : undefined;
    return json({ data: { ...transformed, id: supabaseCartId }, error: null, warning });
  }

  // ── Route: POST /cart/{id}/shipping_address — set address ─────────
  // MUST be checked before /shipping to prevent incorrect substring match
  const shippingAddressMatch = path.match(/^\/([^/]+)\/shipping_address$/);
  if (req.method === "POST" && shippingAddressMatch) {
    const violetCartId = shippingAddressMatch[1];
    const body = await req.json();

    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/shipping_address`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Set shipping address failed (${res.status}): ${text}`,
        { violetCartId, route: "POST /cart/{id}/shipping_address", httpStatus: res.status },
        userId,
      );

      // Translate Violet's blocked_address error (code 4236) into a user-friendly message.
      // @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/customers — Blocked Addresses
      if (
        text.includes("blocked_address") ||
        text.includes("blocked due to a history") ||
        text.includes('"code":4236')
      ) {
        return errorResponse(
          "VIOLET.BLOCKED_ADDRESS",
          "This address cannot be used for delivery. Please provide a different address.",
          res.status,
        );
      }

      return errorResponse(
        "VIOLET.API_ERROR",
        `Set shipping address failed (${res.status}): ${text}`,
        res.status,
      );
    }

    return new Response(null, { status: 200, headers: jsonHeaders });
  }

  // ── Route: GET /cart/{id}/shipping/available — get methods ─────────
  const shippingAvailableMatch = path.match(/^\/([^/]+)\/shipping\/available$/);
  if (req.method === "GET" && shippingAvailableMatch) {
    const violetCartId = shippingAvailableMatch[1];

    // Note: This call is intentionally slow (2–5s) — it queries carrier APIs.
    // The mobile app should show a per-bag skeleton loader while pending.
    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/shipping/available`, {
      method: "GET",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Get available shipping failed (${res.status}): ${text}`,
        { violetCartId, route: "GET /cart/{id}/shipping/available", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Get available shipping failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const rawData = await res.json();
    // Transform Violet snake_case → ShippingMethodsAvailable[] (camelCase).
    // This mirrors VioletAdapter.getAvailableShippingMethods() on web.
    // Mobile reads our internal format — never the raw Violet field names.
    const data = transformShippingAvailable(rawData);
    return json({ data, error: null });
  }

  // ── Route: POST /cart/{id}/shipping — set shipping methods ─────────
  // Must be AFTER shipping_address check to avoid path conflict.
  const shippingMatch = path.match(/^\/([^/]+)\/shipping$/);
  if (req.method === "POST" && shippingMatch) {
    const violetCartId = shippingMatch[1];
    const body = await req.json();

    // Body: [{ bag_id: number, shipping_method_id: string }]
    // Violet returns the full "priced cart" (shipping_total per bag updated).
    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/shipping`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Set shipping methods failed (${res.status}): ${text}`,
        { violetCartId, route: "POST /cart/{id}/shipping", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Set shipping methods failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const transformed = transformCart(cartData);
    if (!transformed) {
      return errorResponse("CART.INVALID_RESPONSE", "Violet returned invalid cart data", 502);
    }
    // Refresh Supabase cart row with updated timestamp
    await upsertCart(violetCartId, userId);
    return json({ data: transformed, error: null });
  }

  // ── Route: POST /cart/{id}/discounts — add discount code ───────────
  const discountsMatch = path.match(/^\/([^/]+)\/discounts$/);
  if (req.method === "POST" && discountsMatch) {
    const violetCartId = discountsMatch[1];
    const body = await req.json();

    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/discounts`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Add discount failed (${res.status}): ${text}`,
        { violetCartId, route: "POST /cart/{id}/discounts", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Add discount failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const transformed = transformCart(cartData);
    if (!transformed) {
      return errorResponse("CART.INVALID_RESPONSE", "Violet returned invalid cart data", 502);
    }
    return json({ data: transformed, error: null });
  }

  // ── Route: DELETE /cart/{id}/discounts/{discountId} — remove discount ──
  const discountDeleteMatch = path.match(/^\/([^/]+)\/discounts\/([^/]+)$/);
  if (req.method === "DELETE" && discountDeleteMatch) {
    const violetCartId = discountDeleteMatch[1];
    const discountId = discountDeleteMatch[2];

    const res = await violetFetch(
      `${VIOLET_API_BASE}/checkout/cart/${violetCartId}/discounts/${discountId}`,
      { method: "DELETE" },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Remove discount failed (${res.status}): ${text}`,
        { violetCartId, route: "DELETE /cart/{id}/discounts/{discountId}", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Remove discount failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const transformed = transformCart(cartData);
    if (!transformed) {
      return errorResponse("CART.INVALID_RESPONSE", "Violet returned invalid cart data", 502);
    }
    return json({ data: transformed, error: null });
  }

  // ── Route: POST /cart/{id}/customer — set customer info (Story 4.4) ──
  // MUST be checked before /submit to avoid path conflict.
  const customerMatch = path.match(/^\/([^/]+)\/customer$/);
  if (req.method === "POST" && customerMatch) {
    const violetCartId = customerMatch[1];
    const body = await req.json();

    /**
     * Forward to Violet POST /checkout/cart/{id}/customer.
     * Mobile sends snake_case directly (email, first_name, last_name).
     *
     * @see https://docs.violet.io/api-reference/checkout-cart/apply-guest-customer-to-cart
     */
    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/customer`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Set customer failed (${res.status}): ${text}`,
        { violetCartId, route: "POST /cart/{id}/customer", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Set customer failed (${res.status}): ${text}`,
        res.status,
      );
    }

    return new Response(null, { status: 200, headers: jsonHeaders });
  }

  // ── Route: POST /cart/{id}/billing_address — set billing (Story 4.4) ──
  // MUST be checked before /submit to avoid path conflict.
  const billingAddressMatch = path.match(/^\/([^/]+)\/billing_address$/);
  if (req.method === "POST" && billingAddressMatch) {
    const violetCartId = billingAddressMatch[1];
    const body = await req.json();

    /**
     * Forward to Violet POST /checkout/cart/{id}/billing_address.
     * Same body shape as shipping_address but WITHOUT phone.
     *
     * @see https://docs.violet.io/api-reference/checkout-cart/set-billing-address
     */
    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/billing_address`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Set billing address failed (${res.status}): ${text}`,
        { violetCartId, route: "POST /cart/{id}/billing_address", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Set billing address failed (${res.status}): ${text}`,
        res.status,
      );
    }

    return new Response(null, { status: 200, headers: jsonHeaders });
  }

  // ── Route: POST /cart/{id}/submit — submit order (Story 4.4) ──────
  const submitMatch = path.match(/^\/([^/]+)\/submit$/);
  if (req.method === "POST" && submitMatch) {
    const violetCartId = submitMatch[1];
    const body = await req.json();

    /**
     * Forward to Violet POST /checkout/cart/{id}/submit.
     * Body: { app_order_id: "uuid" }
     *
     * Returns order status:
     * - COMPLETED: card charged, order placed
     * - REQUIRES_ACTION: 3DS needed (payment_intent_client_secret in response)
     * - REJECTED: payment rejected
     *
     * @see https://docs.violet.io/api-reference/checkout-cart/submit-cart
     */
    const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/submit`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logEdgeFunctionError(
        "VIOLET.API_ERROR",
        `Submit order failed (${res.status}): ${text}`,
        { violetCartId, route: "POST /cart/{id}/submit", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.API_ERROR",
        `Submit order failed (${res.status}): ${text}`,
        res.status,
      );
    }

    /**
     * Raw Violet responses must be transformed before returning to clients.
     * Returning raw data would leak Violet internal fields and force clients
     * to handle snake_case, breaking our camelCase contract. The submit
     * response is an order-like object — we use transformOrder plus the
     * payment_intent_client_secret needed for 3D Secure flows.
     */
    const orderData = await res.json();
    const rawObj =
      orderData && typeof orderData === "object" ? (orderData as Record<string, unknown>) : {};
    const transformedOrder = transformOrder(orderData);
    return json({
      data: {
        ...transformedOrder,
        paymentIntentClientSecret: rawObj.payment_intent_client_secret
          ? String(rawObj.payment_intent_client_secret)
          : undefined,
      },
      error: null,
    });
  }

  // ── Route: GET /orders/{orderId} — fetch order details (Story 4.5, enhanced Story 5.1) ──
  const orderMatch = path.match(/^\/orders\/([^/]+)$/);
  if (req.method === "GET" && orderMatch) {
    const orderId = orderMatch[1];

    /**
     * Ownership check via orders table (Story 5.1, Code Review Fix C2).
     *
     * Three auth paths, tried in order:
     * 1. **Guest token** (query param `?token=xxx`): Hash with SHA-256, look up
     *    `order_lookup_token_hash` in orders table and verify `violet_order_id` matches.
     *    This is the primary path for guest buyers accessing their order via the
     *    unique link shown on the confirmation page.
     * 2. **JWT ownership**: Check `user_id` or `session_id` in orders table matches
     *    the authenticated user's JWT `sub` claim.
     * 3. **Cart fallback**: For orders not yet persisted to Supabase (persistence
     *    failure edge case), check the carts table for a completed/submitted cart
     *    owned by this user.
     *
     * @see persistAndConfirmOrderFn in apps/web/src/server/checkout.ts — persists order + generates token
     * @see packages/shared/src/utils/guestToken.ts — token generation + hashing
     */
    const supabase = getSupabaseAdmin();
    const url = new URL(req.url);
    const guestToken = url.searchParams.get("token");

    let isAuthorized = false;

    // Path 1: Guest token auth — hash the token and look up in orders table
    if (guestToken) {
      /**
       * SHA-256 hash computed inline (Deno runtime — no node:crypto import needed).
       * Mirrors hashOrderLookupToken() from packages/shared/src/utils/guestToken.ts
       * but uses the Web Crypto API available in Deno/Edge Functions.
       */
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(guestToken));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      const { data: tokenMatch } = await supabase
        .from("orders")
        .select("id")
        .eq("violet_order_id", orderId)
        .eq("order_lookup_token_hash", tokenHash)
        .limit(1)
        .maybeSingle();

      if (tokenMatch) {
        isAuthorized = true;
      }
    }

    // Path 2: JWT-based ownership check
    if (!isAuthorized) {
      const { data: orderOwnership } = await supabase
        .from("orders")
        .select("id")
        .eq("violet_order_id", orderId)
        .or(`user_id.eq.${userId},session_id.eq.${userId}`)
        .limit(1)
        .maybeSingle();

      if (orderOwnership) {
        isAuthorized = true;
      }
    }

    // Path 3: Cart fallback (order may not be persisted yet)
    if (!isAuthorized) {
      const { data: cartOwnership } = await supabase
        .from("carts")
        .select("id")
        .eq("user_id", userId)
        .in("status", ["completed", "submitted"])
        .limit(1)
        .maybeSingle();

      if (cartOwnership) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return errorResponse("ORDER.ACCESS_DENIED", "No order found for this user", 403);
    }

    /**
     * Fetches complete order details from Violet for the confirmation page.
     *
     * After cart submission, the cart becomes an order. The order is accessed
     * by its Violet order ID (returned in the submit response), not the cart ID.
     *
     * The response includes bags with items, customer info, addresses, and totals.
     * We transform snake_case → camelCase at this boundary for mobile clients.
     *
     * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/get-order-by-id
     */
    const res = await violetFetch(`${VIOLET_API_BASE}/orders/${orderId}`, {
      method: "GET",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logEdgeFunctionError(
        "VIOLET.ORDER_NOT_FOUND",
        `Order fetch failed (${res.status}): ${text}`,
        { orderId, route: "GET /orders/{orderId}", httpStatus: res.status },
        userId,
      );
      return errorResponse(
        "VIOLET.ORDER_NOT_FOUND",
        `Order fetch failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const raw = await res.json();
    return json({ data: transformOrder(raw), error: null });
  }

  // ── Route: GET /offers/{offerId} — resolve offer → first available SKU ──
  // Mobile PDP uses this to get the real sku_id before adding to cart.
  // Violet's POST /checkout/cart/{id}/skus requires a SKU id, not an offer id.
  // @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
  const offerMatch = path.match(/^\/offers\/([^/]+)$/);
  if (req.method === "GET" && offerMatch) {
    const offerId = offerMatch[1];

    const offerRes = await violetFetch(`${VIOLET_API_BASE}/catalog/offers/${offerId}`);

    if (!offerRes.ok) {
      return errorResponse("VIOLET.NOT_FOUND", `Offer ${offerId} not found`, offerRes.status);
    }

    const offer = await offerRes.json();
    const skus: Array<{ id: number; available?: boolean; status?: string }> = offer.skus ?? [];

    // Pick first available SKU — prefer status=AVAILABLE and available=true
    const firstAvailable =
      skus.find((s) => s.available !== false && s.status !== "UNAVAILABLE") ?? skus[0];

    return json({
      data: {
        offerId: String(offer.id),
        name: String(offer.name ?? ""),
        skuId: firstAvailable ? String(firstAvailable.id) : null,
        skuCount: skus.length,
      },
      error: null,
    });
  }

  return errorResponse("CART.NOT_FOUND", "Route not found", 404);
});

/**
 * Transforms Violet's GET /shipping/available response (snake_case) to our
 * internal ShippingMethodsAvailable[] format (camelCase).
 *
 * ## Why transformation is required here
 * The Edge Function is the snake_case → camelCase boundary for mobile clients,
 * mirroring what VioletAdapter.getAvailableShippingMethods() does for web.
 * Mobile reads `ShippingMethodsAvailable[]` (our camelCase format). Without
 * this transformation, `bag.bagId` and `bag.shippingMethods` would be
 * undefined at runtime, crashing the shipping selection screen.
 *
 * ## Field mapping (Violet → internal, confirmed from official docs)
 * - `bag_id` (number)            → `bagId` (string)
 * - `shipping_methods` (array)   → `shippingMethods` (array)
 * - `shipping_method_id` (str)   → `id` (string) — Violet's confirmed field name
 * - `label` (string)             → `label` (string)
 * - `carrier` (string|undefined) → `carrier` (string|undefined)
 * - `price` (number, cents)      → `price` (number, cents)
 *
 * ## Note on delivery time fields
 * `min_days`/`max_days` are kept for forward compatibility but Violet's FAQ
 * confirms these are not provided: "The platforms don't consistently provide
 * shipping time data through their APIs."
 *
 * @see packages/shared/src/adapters/violetAdapter.ts — getAvailableShippingMethods() (web equivalent)
 * @see packages/shared/src/types/cart.types.ts — ShippingMethodsAvailable, ShippingMethod
 * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/shipping-methods
 */
function transformShippingAvailable(raw: unknown): Array<{
  bagId: string;
  shippingMethods: Array<{
    id: string;
    label: string;
    carrier?: string;
    price: number;
    minDays?: number;
    maxDays?: number;
  }>;
}> {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((item) => ({
    bagId: String(item.bag_id ?? ""),
    shippingMethods: Array.isArray(item.shipping_methods)
      ? (item.shipping_methods as Array<Record<string, unknown>>).map((m) => ({
          id: String(m.shipping_method_id ?? ""),
          label: String(m.label ?? ""),
          carrier: m.carrier !== undefined ? String(m.carrier) : undefined,
          price: Math.max(0, Number(m.price ?? 0)),
          minDays: m.min_days !== undefined ? Number(m.min_days) : undefined,
          maxDays: m.max_days !== undefined ? Number(m.max_days) : undefined,
        }))
      : [],
  }));
}

/**
 * Transforms a raw Violet cart response to our internal Cart shape.
 * snake_case → camelCase at the Edge Function boundary (mirrors VioletAdapter).
 *
 * ## Why manual validation instead of Zod
 * The shared `violetCartResponseSchema` is a TypeScript/Node.js Zod schema.
 * Supabase Edge Functions run in Deno and cannot import from `@ecommerce/shared`
 * without a build step. We replicate the shape validation manually here using
 * type guards and safe defaults — the same contract as the Zod schema.
 *
 * If you add a field to `violetCartResponseSchema`, also update this function.
 *
 * @see packages/shared/src/schemas/cart.schema.ts — canonical schema definition
 * @see packages/shared/src/adapters/violetAdapter.ts — parseAndTransformCart() (uses Zod)
 */
/**
 * Returns null when the Violet response is not a valid object. Callers must
 * treat null as an error rather than displaying an empty cart, which would
 * mislead the user into thinking their cart is empty when it may not be.
 */
function transformCart(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;

  /**
   * Violet returns HTTP 200 with errors[] when partial failures occur (e.g.,
   * one SKU out of stock in a multi-SKU cart). Per Channel Docs:
   * "A cart response can come back with status code 200 and still have errors
   * in the errors field. Make sure your system is coded to always check for
   * the presence of the errors field on responses."
   *
   * We log a warning but still transform the cart — the client receives the
   * errors in the transformed bags and can display them appropriately.
   *
   * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart
   */
  const orderErrors = Array.isArray(r.errors) ? r.errors : [];
  if (orderErrors.length > 0) {
    console.warn(
      `[cart] Violet returned 200 with ${orderErrors.length} order-level error(s). ` +
        `Cart ${r.id ?? "?"} may have partial issues. Errors: ${JSON.stringify(orderErrors).slice(0, 200)}`,
    );
  }

  const bags = Array.isArray(r.bags)
    ? (r.bags as Array<Record<string, unknown>>).map((bag) => {
        const items = Array.isArray(bag.skus)
          ? (bag.skus as Array<Record<string, unknown>>).map((sku) => ({
              id: String(sku.id ?? ""),
              skuId: String(sku.sku_id ?? ""),
              productId: "",
              quantity: Math.max(1, Number(sku.quantity ?? 1)),
              unitPrice: Math.max(0, Number(sku.price ?? 0)),
              type: String(sku.product_type ?? "PHYSICAL"),
            }))
          : [];
        const errors = Array.isArray(bag.errors)
          ? (bag.errors as Array<Record<string, unknown>>).map((e) => ({
              code: String(e.code ?? "UNKNOWN"),
              message: String(e.message ?? ""),
              skuId: e.sku_id !== undefined ? String(e.sku_id) : undefined,
            }))
          : [];
        return {
          id: String(bag.id ?? ""),
          merchantId: String(bag.merchant_id ?? ""),
          merchantName: String(bag.merchant_name ?? ""),
          items,
          subtotal: Math.max(0, Number(bag.subtotal ?? 0)),
          tax: Math.max(0, Number(bag.tax ?? 0)),
          shippingTotal: Math.max(0, Number(bag.shipping_total ?? 0)),
          errors,
          isDigital: items.length > 0 && items.every((item) => (item as { type: string }).type !== "PHYSICAL"),
        };
      })
    : [];

  // Total = sum of (subtotal + tax + shippingTotal) per bag — mirrors violetAdapter.ts
  const total = bags.reduce(
    (sum, b) => sum + (b.subtotal as number) + (b.tax as number) + (b.shippingTotal as number),
    0,
  );

  return {
    violetCartId: String(r.id ?? ""),
    userId: null,
    sessionId: null,
    bags,
    total,
    currency: String(r.currency ?? "USD"),
    status: "active",
    allBagsDigital: bags.length > 0 && bags.every((b) => (b as { isDigital: boolean }).isDigital),
    /**
     * Stripe PaymentIntent client secret — present when cart was created with
     * `wallet_based_checkout: true`. Mobile uses this to init PaymentSheet.
     *
     * Extraction order mirrors the web adapter (violetAdapter.ts:1408-1410):
     * 1. Root-level `payment_intent_client_secret` (Violet legacy / some responses)
     * 2. `payment_transactions[0].payment_intent_client_secret` (API Reference format)
     * 3. `payment_transactions[0].metadata.payment_intent_client_secret` (Channel Docs format)
     *
     * In Demo Mode, no PI is created — this will be undefined (expected).
     *
     * @see https://docs.violet.io/prism/payments/payment-integrations/supported-providers/stripe/stripe-elements
     * @see https://docs.violet.io/api-reference/orders-and-checkout/carts/create-cart
     * @see Story 4.4 AC#5
     */
    paymentIntentClientSecret:
      r.payment_intent_client_secret
        ? String(r.payment_intent_client_secret)
        : r.payment_transactions?.[0]?.payment_intent_client_secret
          ? String(r.payment_transactions[0].payment_intent_client_secret)
          : r.payment_transactions?.[0]?.metadata?.payment_intent_client_secret
            ? String(r.payment_transactions[0].metadata.payment_intent_client_secret)
            : undefined,
    /**
     * Stripe publishable key from Violet — needed by mobile PaymentSheet.
     *
     * In Demo/Test Mode, Violet creates PaymentIntents on their own Stripe account.
     * The local `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` won't match — PaymentSheet
     * will fail to load or decline the card. The web app handles this via
     * `getPaymentIntentFn` which returns `stripe_key` from the Violet cart response.
     *
     * The mobile checkout screen reads this field to call `initPaymentSheet()`
     * with the correct key (Bug fix — equivalent to web's `getStripePromise()` cache).
     *
     * @see apps/mobile/src/app/checkout.tsx — handleBillingConfirm
     * @see apps/web/src/server/checkout.ts — getPaymentIntentFn
     * @see packages/shared/src/adapters/violetAdapter.ts — stripe_key mapping
     */
    stripePublishableKey: r.stripe_key ? String(r.stripe_key) : undefined,

    /**
     * Order-level errors from Violet (200-with-errors pattern).
     * Empty array when no errors. Non-empty means partial failure.
     *
     * @see https://docs.violet.io/prism/checkout-guides/carts-and-bags/carts/lifecycle-of-a-cart
     */
    errors: orderErrors,
  };
}

/**
 * Transforms a raw Violet order response to our internal OrderDetail shape.
 * snake_case → camelCase at the Edge Function boundary for mobile clients.
 *
 * ## Field mapping (Violet → internal)
 * - `sub_total` → `subtotal`
 * - `shipping_total` → `shippingTotal`
 * - `tax_total` → `taxTotal`
 * - `bags[].merchant_name` → `bags[].merchantName`
 * - `bags[].financial_status` → `bags[].financialStatus`
 * - `bags[].skus[]` → `bags[].items[]` (renamed for clarity)
 * - `bags[].skus[].line_price` → `bags[].items[].linePrice`
 * - `customer.first_name` → `customer.firstName`
 * - `shipping_address.address_1` → `shippingAddress.address1`
 * - `date_submitted` → `dateSubmitted`
 *
 * Mirrors VioletAdapter.getOrder() in packages/shared/src/adapters/violetAdapter.ts.
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/orders/get-order-by-id
 */
function transformOrder(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return { id: "", status: "COMPLETED", bags: [], total: 0 };
  }
  const r = raw as Record<string, unknown>;

  const rawBags = Array.isArray(r.bags) ? (r.bags as Array<Record<string, unknown>>) : [];
  const bags = rawBags.map((bag) => {
    const rawSkus = Array.isArray(bag.skus) ? (bag.skus as Array<Record<string, unknown>>) : [];
    const items = rawSkus.map((sku) => ({
      skuId: String(sku.id ?? ""),
      name: String(sku.name ?? ""),
      quantity: Number(sku.quantity ?? 0),
      price: Number(sku.price ?? 0),
      linePrice: Number(sku.line_price ?? 0),
      thumbnail: sku.thumbnail ? String(sku.thumbnail) : undefined,
    }));

    const sm = bag.shipping_method as Record<string, unknown> | undefined;

    return {
      id: String(bag.id ?? ""),
      merchantId: String(bag.merchant_id ?? ""),
      merchantName: String(bag.merchant_name ?? ""),
      status: String(bag.status ?? ""),
      financialStatus: String(bag.financial_status ?? ""),
      items,
      subtotal: Number(bag.sub_total ?? 0),
      shippingTotal: Number(bag.shipping_total ?? 0),
      taxTotal: Number(bag.tax_total ?? 0),
      total: Number(bag.total ?? 0),
      shippingMethod: sm
        ? { carrier: String(sm.carrier ?? ""), label: String(sm.label ?? "") }
        : undefined,
    };
  });

  const customer = (r.customer as Record<string, unknown>) ?? {};
  const addr = (r.shipping_address as Record<string, unknown>) ?? {};

  return {
    id: String(r.id ?? ""),
    status: String(r.status ?? "COMPLETED"),
    currency: String(r.currency ?? "USD"),
    subtotal: Number(r.sub_total ?? 0),
    shippingTotal: Number(r.shipping_total ?? 0),
    taxTotal: Number(r.tax_total ?? 0),
    total: Number(r.total ?? 0),
    bags,
    customer: {
      email: String(customer.email ?? ""),
      firstName: String(customer.first_name ?? ""),
      lastName: String(customer.last_name ?? ""),
    },
    shippingAddress: {
      address1: String(addr.address_1 ?? ""),
      city: String(addr.city ?? ""),
      state: String(addr.state ?? ""),
      postalCode: String(addr.postal_code ?? ""),
      country: String(addr.country ?? ""),
    },
    dateSubmitted: r.date_submitted ? String(r.date_submitted) : undefined,
  };
}
