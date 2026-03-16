/**
 * Edge Function: guest-order-lookup
 *
 * @module supabase/functions/guest-order-lookup
 *
 * Handles guest order lookups for both web and mobile platforms.
 * This is the mobile counterpart to the web's guestOrders.ts server functions.
 * Both implementations query the same Supabase tables with the same logic.
 *
 * ## Two lookup modes
 *
 * 1. **token** (`{ type: "token", token: "<base64url>" }`):
 *    Hash the provided plaintext token (SHA-256 via Web Crypto API), query
 *    orders by hash. No auth session required — the token's entropy (256 bits)
 *    serves as the authentication factor.
 *
 * 2. **email** (`{ type: "email" }` + Authorization header):
 *    Verify the JWT from Authorization header via `supabase.auth.getUser(jwt)`,
 *    extract the verified email, query all orders for that email.
 *    The JWT must come from a valid Supabase OTP session.
 *
 * ## Request/Response format
 * - Request: POST with JSON body `{ type: "token" | "email", token?: string }`
 * - Response: `{ data: OrderWithBagsAndItems | OrderWithBagsAndItems[] | null, error: ErrorObj | null }`
 * - Token mode returns a single order (or null), email mode returns an array.
 *
 * ## Security
 * - Both modes use service_role to query orders (no anon RLS policy on orders table).
 * - For email mode, JWT verification confirms the caller's email identity.
 * - Token-not-found returns `{ data: null, error: null }` (not 404) to prevent
 *   information leakage about which tokens/orders exist.
 * - Internal Supabase errors return generic messages — never expose DB error details.
 *
 * ## CORS
 * Supports both browser (web) and native mobile clients via shared corsHeaders.
 * Preflight OPTIONS requests are handled with a 200 response.
 *
 * ## Data flow
 * ```
 * Mobile app → POST /functions/v1/guest-order-lookup
 *   → { type: "token", token: "..." }
 *     → sha256Hex(token) → Supabase query by hash → Response
 *   → { type: "email" } + Authorization: Bearer <jwt>
 *     → supabase.auth.getUser(jwt) → extract email
 *     → Supabase query by email → Response
 * ```
 *
 * @see {@link lookupOrderByTokenHandler} — web equivalent for token-based lookup
 * @see {@link lookupOrdersByEmailHandler} — web equivalent for email-based lookup
 * @see Story 5.4 — Guest Order Lookup (web + mobile)
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

/**
 * Compute SHA-256 hex digest of a string using the Web Crypto API (available in Deno).
 *
 * This is the Edge Function equivalent of `hashOrderLookupToken()` from
 * `@ecommerce/shared/server/utils`. Both produce identical SHA-256 hex output,
 * but this version uses Web Crypto (Deno) while the shared version uses Node.js
 * `node:crypto`. They are kept separate to avoid cross-runtime dependencies.
 *
 * @param input - The plaintext string to hash (typically a base64url lookup token).
 * @returns The SHA-256 hex digest (64 lowercase hex characters).
 *
 * @remarks
 * Both token-based and email-based lookups include `order_refunds(*)` in the
 * Supabase select to return refund details alongside bag data. Refunds are
 * populated by the BAG_REFUNDED webhook handler after fetching from Violet's
 * Refund API (`GET /v1/orders/{id}/bags/{id}/refunds`). Service_role bypasses
 * RLS, so the `service_role_all_order_refunds` policy covers all access here.
 *
 * @see https://docs.violet.io/api-reference/orders-and-checkout/order-refunds/refund-bag — Violet Refund API
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Main request handler for the guest-order-lookup Edge Function.
 *
 * Accepts POST requests only (returns 405 for other methods).
 * CORS preflight (OPTIONS) is handled separately.
 *
 * @param req - The incoming HTTP request from web or mobile clients.
 * @returns JSON response with `{ data, error }` shape.
 */
Deno.serve(async (req: Request) => {
  // ─── CORS preflight ──────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ data: null, error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } }),
      { status: 405, headers: jsonHeaders },
    );
  }

  let body: { type: "token" | "email"; token?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ data: null, error: { code: "INVALID_BODY", message: "Invalid JSON body" } }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const { type, token } = body;

  if (type !== "token" && type !== "email") {
    return new Response(
      JSON.stringify({
        data: null,
        error: { code: "INVALID_TYPE", message: 'type must be "token" or "email"' },
      }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const supabase = getSupabaseAdmin();

  // ─── Token-based lookup ──────────────────────────────────────────
  if (type === "token") {
    if (!token) {
      return new Response(
        JSON.stringify({
          data: null,
          error: { code: "MISSING_TOKEN", message: "token is required for type=token" },
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const tokenHash = await sha256Hex(token);
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_bags(*, order_items(*), order_refunds(*))")
      .eq("order_lookup_token_hash", tokenHash)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return Response.json({ data: null, error: null }); // not found — no info leakage
      }
      return new Response(
        JSON.stringify({
          data: null,
          error: { code: "DB_ERROR", message: "Failed to look up order" },
        }),
        { status: 500, headers: jsonHeaders },
      );
    }

    return Response.json({ data, error: null });
  }

  // ─── Email-based lookup ──────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  const jwt = authHeader?.replace("Bearer ", "");

  if (!jwt) {
    return new Response(
      JSON.stringify({
        data: null,
        error: { code: "MISSING_TOKEN", message: "Authorization header required" },
      }),
      { status: 401, headers: jsonHeaders },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(jwt);

  if (authError || !user?.email) {
    return new Response(
      JSON.stringify({
        data: null,
        error: { code: "NOT_AUTHENTICATED", message: "Invalid token" },
      }),
      { status: 401, headers: jsonHeaders },
    );
  }

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*, order_bags(*, order_items(*), order_refunds(*))")
    .eq("email", user.email)
    .order("created_at", { ascending: false });

  if (ordersError) {
    return new Response(
      JSON.stringify({
        data: null,
        error: { code: "DB_ERROR", message: "Failed to fetch orders" },
      }),
      { status: 500, headers: jsonHeaders },
    );
  }

  return Response.json({ data: orders ?? [], error: null });
});
