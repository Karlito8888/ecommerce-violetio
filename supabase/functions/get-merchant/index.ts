// @ts-nocheck — Deno runtime (Supabase Edge Function)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { violetFetch, VIOLET_API_BASE } from "../_shared/fetchWithRetry.ts";

/**
 * GET /functions/v1/get-merchant?merchantId=123
 *
 * Fetches merchant details from Violet API (GET /merchants/{id})
 * and returns enriched merchant data for the mobile merchant page.
 *
 * @see https://docs.violet.io/api-reference/merchants/get-merchant-by-id
 */
serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const url = new URL(req.url);
    const merchantId = url.searchParams.get("merchantId");

    if (!merchantId) {
      return new Response(
        JSON.stringify({ data: null, error: { code: "MISSING_PARAM", message: "merchantId is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";
    const res = await violetFetch(`${apiBase}/merchants/${merchantId}`);

    if (!res.ok) {
      const body = await res.text();
      return new Response(
        JSON.stringify({ data: null, error: { code: "VIOLET.API_ERROR", message: `Violet returned ${res.status}` } }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const raw = await res.json();
    const merchant = {
      id: String(raw.id ?? ""),
      name: String(raw.name ?? "Unknown"),
      platform: raw.source ?? null,
      status: raw.status ?? "UNKNOWN",
      commissionRate: raw.commission_rate != null ? Number(raw.commission_rate) : null,
      currency: raw.currency ?? null,
      storeUrl: raw.store_url ?? null,
      connectedAt: raw.date_created ?? null,
    };

    return new Response(
      JSON.stringify({ data: merchant, error: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ data: null, error: { code: "INTERNAL", message: err instanceof Error ? err.message : "Unknown error" } }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
