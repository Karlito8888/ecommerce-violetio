/**
 * Edge Function: guest-order-lookup
 *
 * Handles guest order lookups for both web and mobile platforms.
 * Two lookup modes:
 *
 * 1. **token**: Hash the provided plaintext token (SHA-256), query orders by hash.
 *    No auth session required.
 *
 * 2. **email**: Verify the JWT from Authorization header, extract email,
 *    query all orders for that email.
 *
 * ## Security
 * Both modes use service_role to query orders (no anon RLS policy on orders table).
 * For email mode, JWT verification via `supabase.auth.getUser(jwt)` confirms
 * the caller's email identity (Supabase OTP session must exist on client side).
 *
 * ## CORS
 * Supports both browser and native mobile clients via shared corsHeaders.
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

/**
 * Compute SHA-256 hex digest of a string (Web Crypto API — available in Deno).
 *
 * ## Nested select: `order_refunds (*)`
 * Both token-based and email-based lookups include `order_refunds(*)` in the
 * Supabase select to return refund details alongside bag data. Refunds are
 * populated by the BAG_REFUNDED webhook handler after fetching from Violet's
 * Refund API (GET /v1/orders/{id}/bags/{id}/refunds). Service_role bypasses
 * RLS, so the `service_role_all_order_refunds` policy covers all access here.
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
