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
import { getVioletHeaders } from "../_shared/violetAuth.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const VIOLET_API_BASE = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return json({ data: null, error: { code, message } }, status);
}

/** Validates the caller's Supabase JWT and returns the user ID, or null. */
async function validateUser(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const jwt = authHeader.slice(7);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) return null;
  return data.user.id;
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

/** Fetches product info map from cart_items for a given cart UUID. */
async function getProductInfoMap(
  cartId: string,
): Promise<Record<string, { name: string | null; thumbnailUrl: string | null }>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("cart_items")
    .select("sku_id, product_name, thumbnail_url")
    .eq("cart_id", cartId);

  const map: Record<string, { name: string | null; thumbnailUrl: string | null }> = {};
  for (const row of data ?? []) {
    map[row.sku_id] = { name: row.product_name, thumbnailUrl: row.thumbnail_url };
  }
  return map;
}

/** Upserts a cart row in Supabase and returns the Supabase cart UUID. */
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

  if (error || !data) return null;
  return data.id;
}

Deno.serve(async (req: Request) => {
  // ── CORS preflight ─────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      },
    });
  }

  // ── Auth gate ──────────────────────────────────────────────────────
  const userId = await validateUser(req);
  if (!userId) {
    return errorResponse("AUTH.REQUIRED", "Valid Supabase JWT required", 401);
  }

  // ── Violet auth headers ────────────────────────────────────────────
  const violetHeadersResult = await getVioletHeaders();
  if (violetHeadersResult.error) {
    return errorResponse("VIOLET.CONFIG_ERROR", violetHeadersResult.error.message, 500);
  }
  const violetHeaders = {
    ...violetHeadersResult.data,
    "Content-Type": "application/json",
  };

  const url = new URL(req.url);
  // Path after /functions/v1/cart
  const path = url.pathname.replace(/.*\/cart/, "");
  const appId = Deno.env.get("VIOLET_APP_ID");

  // ── Route: POST /cart — create cart ───────────────────────────────
  if (req.method === "POST" && (path === "" || path === "/")) {
    if (!appId) return errorResponse("VIOLET.CONFIG_MISSING", "VIOLET_APP_ID not configured", 500);

    /**
     * `wallet_based_checkout: true` — Violet creates a Stripe PaymentIntent at cart
     * creation time. Without this, `payment_intent_client_secret` is absent from
     * cart responses, breaking the Stripe PaymentElement/PaymentSheet flow.
     *
     * @see https://docs.violet.io/guides/checkout/payments — wallet-based checkout
     * @see Story 4.4 AC#5, AC#12
     */
    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart`, {
      method: "POST",
      headers: violetHeaders,
      body: JSON.stringify({
        channel_id: Number(appId),
        currency: "USD",
        wallet_based_checkout: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return errorResponse(
        "VIOLET.API_ERROR",
        `Cart creation failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const violetCartId = String(cartData.id);
    const supabaseCartId = await upsertCart(violetCartId, userId);

    return json({
      data: {
        id: supabaseCartId ?? "",
        violetCartId,
        bags: [],
        total: 0,
        currency: "USD",
        status: "active",
      },
      error: null,
    });
  }

  // ── Route: GET /cart/{id} — fetch cart ────────────────────────────
  const getMatch = path.match(/^\/([^/]+)$/);
  if (req.method === "GET" && getMatch) {
    const violetCartId = getMatch[1];
    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}`, {
      method: "GET",
      headers: violetHeaders,
    });

    if (!res.ok) {
      return errorResponse("VIOLET.API_ERROR", `Fetch cart failed (${res.status})`, res.status);
    }

    const cartData = await res.json();
    const supabaseCartId = await upsertCart(violetCartId, userId);
    const transformed = transformCart(cartData);

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

    return json({ data: { ...transformed, id: supabaseCartId ?? "" }, error: null });
  }

  // ── Route: POST /cart/{id}/skus — add SKU ─────────────────────────
  const addSkuMatch = path.match(/^\/([^/]+)\/skus$/);
  if (req.method === "POST" && addSkuMatch) {
    const violetCartId = addSkuMatch[1];
    const body = await req.json();
    if (!appId) return errorResponse("VIOLET.CONFIG_MISSING", "VIOLET_APP_ID not configured", 500);

    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/skus`, {
      method: "POST",
      headers: violetHeaders,
      body: JSON.stringify({
        sku_id: body.sku_id,
        quantity: body.quantity ?? 1,
        app_id: Number(appId),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return errorResponse(
        "VIOLET.API_ERROR",
        `Add SKU failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const supabaseCartId = await upsertCart(violetCartId, userId);

    // Store product info for name/thumbnail display at get-cart time
    if (supabaseCartId) {
      const transformed = transformCart(cartData);
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

      return json({ data: { ...transformed, id: supabaseCartId }, error: null });
    }

    return json({ data: { ...transformCart(cartData), id: supabaseCartId ?? "" }, error: null });
  }

  // ── Route: PUT /cart/{id}/skus/{skuId} — update qty ───────────────
  const updateSkuMatch = path.match(/^\/([^/]+)\/skus\/([^/]+)$/);
  if (req.method === "PUT" && updateSkuMatch) {
    const [, violetCartId, skuId] = updateSkuMatch;
    const body = await req.json();

    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/skus/${skuId}`, {
      method: "PUT",
      headers: violetHeaders,
      body: JSON.stringify({ quantity: body.quantity }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return errorResponse(
        "VIOLET.API_ERROR",
        `Update SKU failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const supabaseCartId = await upsertCart(violetCartId, userId);
    return json({ data: { ...transformCart(cartData), id: supabaseCartId ?? "" }, error: null });
  }

  // ── Route: DELETE /cart/{id}/skus/{skuId} — remove SKU ────────────
  if (req.method === "DELETE" && updateSkuMatch) {
    const [, violetCartId, skuId] = updateSkuMatch;

    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/skus/${skuId}`, {
      method: "DELETE",
      headers: violetHeaders,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return errorResponse(
        "VIOLET.API_ERROR",
        `Remove SKU failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const supabaseCartId = await upsertCart(violetCartId, userId);

    // Clean up orphan row — Violet confirmed removal, so delete from cart_items.
    // Non-fatal: orphan rows don't show incorrect data but accumulate unbounded.
    if (supabaseCartId) {
      await deleteCartItem(supabaseCartId, skuId);
    }

    return json({ data: { ...transformCart(cartData), id: supabaseCartId ?? "" }, error: null });
  }

  // ── Route: POST /cart/{id}/shipping_address — set address ─────────
  // MUST be checked before /shipping to prevent incorrect substring match
  const shippingAddressMatch = path.match(/^\/([^/]+)\/shipping_address$/);
  if (req.method === "POST" && shippingAddressMatch) {
    const violetCartId = shippingAddressMatch[1];
    const body = await req.json();

    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/shipping_address`, {
      method: "POST",
      headers: violetHeaders,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
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
    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/shipping/available`, {
      method: "GET",
      headers: violetHeaders,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
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
    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/shipping`, {
      method: "POST",
      headers: violetHeaders,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return errorResponse(
        "VIOLET.API_ERROR",
        `Set shipping methods failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const cartData = await res.json();
    const transformed = transformCart(cartData);
    // Refresh Supabase cart row with updated timestamp
    await upsertCart(violetCartId, userId);
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
    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/customer`, {
      method: "POST",
      headers: violetHeaders,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
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
    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/billing_address`, {
      method: "POST",
      headers: violetHeaders,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
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
    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart/${violetCartId}/submit`, {
      method: "POST",
      headers: violetHeaders,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return errorResponse(
        "VIOLET.API_ERROR",
        `Submit order failed (${res.status}): ${text}`,
        res.status,
      );
    }

    const orderData = await res.json();
    return json({ data: orderData, error: null });
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
function transformCart(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return {
      violetCartId: "",
      userId: null,
      sessionId: null,
      bags: [],
      total: 0,
      currency: "USD",
      status: "active",
    };
  }
  const r = raw as Record<string, unknown>;

  const bags = Array.isArray(r.bags)
    ? (r.bags as Array<Record<string, unknown>>).map((bag) => {
        const items = Array.isArray(bag.skus)
          ? (bag.skus as Array<Record<string, unknown>>).map((sku) => ({
              id: String(sku.id ?? ""),
              skuId: String(sku.sku_id ?? ""),
              productId: "",
              quantity: Math.max(1, Number(sku.quantity ?? 1)),
              unitPrice: Math.max(0, Number(sku.price ?? 0)),
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
    /**
     * Stripe PaymentIntent client secret — present when cart was created with
     * `wallet_based_checkout: true`. Mobile uses this to init PaymentSheet.
     *
     * @see Story 4.4 AC#5
     */
    paymentIntentClientSecret: r.payment_intent_client_secret
      ? String(r.payment_intent_client_secret)
      : undefined,
  };
}
