/**
 * Edge Function: cart
 *
 * Proxies Violet cart API calls for the mobile app, keeping the Violet token
 * server-side. Also persists cart state to Supabase after each mutation.
 *
 * ## Routes (matched by method + URL path suffix)
 *
 * | Method | Path                          | Action         |
 * |--------|-------------------------------|----------------|
 * | POST   | /cart                         | Create cart    |
 * | POST   | /cart/{id}/skus               | Add SKU        |
 * | PUT    | /cart/{id}/skus/{skuId}       | Update qty     |
 * | DELETE | /cart/{id}/skus/{skuId}       | Remove SKU     |
 * | GET    | /cart/{id}                    | Fetch cart     |
 *
 * ## Authentication
 *
 * Requires a valid Supabase user JWT in `Authorization: Bearer <token>`.
 * The JWT is validated before any Violet API call is made.
 * The Violet token is never exposed to mobile clients.
 *
 * @see supabase/functions/_shared/violetAuth.ts — getVioletHeaders()
 * @see supabase/functions/_shared/supabaseAdmin.ts — getSupabaseAdmin()
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

    const res = await fetch(`${VIOLET_API_BASE}/checkout/cart`, {
      method: "POST",
      headers: violetHeaders,
      body: JSON.stringify({ channel_id: Number(appId), currency: "USD" }),
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
    return json({ data: { ...transformCart(cartData), id: supabaseCartId ?? "" }, error: null });
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
    return json({ data: { ...transformCart(cartData), id: supabaseCartId ?? "" }, error: null });
  }

  return errorResponse("CART.NOT_FOUND", "Route not found", 404);
});

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

  const total = bags.reduce((sum, b) => sum + (b.subtotal as number), 0);

  return {
    violetCartId: String(r.id ?? ""),
    userId: null,
    sessionId: null,
    bags,
    total,
    currency: String(r.currency ?? "USD"),
    status: "active",
  };
}
