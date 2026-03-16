/**
 * Edge Function — records browsing events from mobile clients.
 *
 * Validates the user's JWT from the Authorization header, then writes
 * the event to user_events using the service role client (bypasses RLS).
 *
 * @module track-event
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_EVENT_TYPES = new Set(["product_view", "search", "category_view"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: extract user from JWT ───────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip anonymous users — tracking only for authenticated accounts
    if (user.is_anonymous) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse and validate event ──────────────────────────────────────────────
    const { event_type, payload } = await req.json();

    if (!event_type || !VALID_EVENT_TYPES.has(event_type)) {
      return new Response(JSON.stringify({ error: `Invalid event_type: ${event_type}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /**
     * M3 code-review fix — validate payload shape per event type.
     *
     * Without this, a malicious client could send arbitrary JSON (huge objects,
     * unexpected structures) that would be stored in the JSONB column. Downstream
     * consumers (Stories 6.3, 6.5, 6.6) assume specific payload shapes and could
     * break on unexpected data. The DB CHECK constraint only validates event_type,
     * not the payload itself.
     *
     * Validation is intentionally lenient: we check required fields exist and
     * have the right types, but allow extra fields for forward compatibility.
     */
    const validPayload = payload ?? {};
    if (event_type === "product_view") {
      if (!validPayload.product_id || typeof validPayload.product_id !== "string") {
        return new Response(
          JSON.stringify({ error: "product_view requires payload.product_id (string)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else if (event_type === "search") {
      if (!validPayload.query || typeof validPayload.query !== "string") {
        return new Response(JSON.stringify({ error: "search requires payload.query (string)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof validPayload.result_count !== "number") {
        return new Response(
          JSON.stringify({ error: "search requires payload.result_count (number)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else if (event_type === "category_view") {
      if (!validPayload.category_id || typeof validPayload.category_id !== "string") {
        return new Response(
          JSON.stringify({ error: "category_view requires payload.category_id (string)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Write with service role client ────────────────────────────────────────
    const serviceClient = getSupabaseAdmin();

    const { error } = await serviceClient.from("user_events").insert({
      user_id: user.id,
      event_type,
      payload: payload ?? {},
    });

    if (error) {
      console.error("[track-event] Insert error:", error.message);
      return new Response(JSON.stringify({ error: "Failed to record event" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[track-event] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
