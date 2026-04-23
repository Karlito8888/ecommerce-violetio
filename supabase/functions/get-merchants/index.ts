// @ts-nocheck — Deno runtime (Supabase Edge Function)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { violetFetch, VIOLET_API_BASE } from "../_shared/fetchWithRetry.ts";

/**
 * GET /functions/v1/get-merchants
 *
 * Lists all connected merchants from Violet API (GET /merchants).
 * Used by the mobile merchants listing page.
 *
 * Returns merchants sorted alphabetically by name.
 *
 * @see https://docs.violet.io/api-reference/merchants/get-merchants
 */
serve(async (req: Request) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";
    const res = await violetFetch(`${apiBase}/merchants?page=1&size=50`);

    if (!res.ok) {
      const body = await res.text();
      return new Response(
        JSON.stringify({
          data: null,
          error: { code: "VIOLET.API_ERROR", message: `Violet returned ${res.status}` },
        }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const raw = await res.json();
    const content = raw.content ?? [];

    const merchants = content
      .map((m: Record<string, unknown>) => ({
        merchant_id: String(m.id ?? ""),
        name: String(m.name ?? "Unknown"),
        platform: m.source ?? null,
        status: m.connection_status ?? "UNKNOWN",
        commission_rate: m.commission_rate != null ? Number(m.commission_rate) : null,
        connected_at: m.date_created ?? new Date().toISOString(),
        updated_at: m.date_last_modified ?? new Date().toISOString(),
      }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));

    return new Response(
      JSON.stringify({ data: merchants, error: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        data: null,
        error: { code: "INTERNAL", message: err instanceof Error ? err.message : "Unknown error" },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
