/**
 * Edge Function: health-check
 *
 * Provides a /health endpoint that checks connectivity to external services:
 * Supabase (DB query), Violet.io (API reachability), Stripe (key validation).
 *
 * ## Authentication
 * Uses a shared secret via Authorization Bearer token (HEALTH_CHECK_SECRET).
 * This allows external uptime monitors (UptimeRobot, Pingdom) to call this
 * endpoint without needing Supabase JWTs.
 *
 * ## Response
 * Returns HealthCheckResult with per-service status and overall health.
 * Individual service failures don't crash the function — each is independent.
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

interface ServiceStatus {
  status: "up" | "down" | "unknown";
  latency_ms: number | null;
  error?: string;
}

interface HealthCheckResult {
  overall_status: "healthy" | "degraded" | "down";
  services: {
    supabase: ServiceStatus;
    violet: ServiceStatus;
    stripe: ServiceStatus;
  };
  checked_at: string;
}

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

async function checkSupabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("alert_rules").select("id").limit(1);
    if (error) {
      return { status: "down", latency_ms: Date.now() - start, error: error.message };
    }
    return { status: "up", latency_ms: Date.now() - start };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkViolet(): Promise<ServiceStatus> {
  const start = Date.now();
  const appId = Deno.env.get("VIOLET_APP_ID");
  const appSecret = Deno.env.get("VIOLET_APP_SECRET");
  const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox.violet.io";

  if (!appId || !appSecret) {
    return { status: "unknown", latency_ms: null, error: "VIOLET_APP_ID/SECRET not configured" };
  }

  try {
    // Lightweight endpoint — just check reachability
    const res = await fetch(`${apiBase}/v1/catalog/categories`, {
      method: "GET",
      headers: {
        "X-Violet-App-Id": appId,
        "X-Violet-App-Secret": appSecret,
      },
      signal: AbortSignal.timeout(10000),
    });
    // Any non-network response (even 401/403) means Violet is reachable
    const latency = Date.now() - start;
    if (res.ok || res.status === 401 || res.status === 403) {
      return { status: "up", latency_ms: latency };
    }
    return { status: "down", latency_ms: latency, error: `HTTP ${res.status}` };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

async function checkStripe(): Promise<ServiceStatus> {
  const start = Date.now();
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeKey) {
    return { status: "unknown", latency_ms: null, error: "STRIPE_SECRET_KEY not configured" };
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/charges?limit=0", {
      method: "GET",
      headers: { Authorization: `Bearer ${stripeKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const latency = Date.now() - start;
    if (res.ok) {
      return { status: "up", latency_ms: latency };
    }
    return {
      status: "down",
      latency_ms: latency,
      error: `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: accept HEALTH_CHECK_SECRET (external monitors) or SUPABASE_SERVICE_ROLE_KEY (internal calls)
  const secret = Deno.env.get("HEALTH_CHECK_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  const validTokens = [secret, serviceRoleKey].filter(Boolean);
  if (validTokens.length === 0) {
    return new Response(
      JSON.stringify({
        data: null,
        error: { code: "HEALTH.MISCONFIGURED", message: "No auth secrets configured" },
      }),
      { status: 500, headers: jsonHeaders },
    );
  }

  if (!token || !validTokens.includes(token)) {
    return new Response(
      JSON.stringify({
        data: null,
        error: { code: "HEALTH.UNAUTHORIZED", message: "Invalid token" },
      }),
      { status: 401, headers: jsonHeaders },
    );
  }

  // Run all checks in parallel
  const [supabase, violet, stripe] = await Promise.all([
    checkSupabase(),
    checkViolet(),
    checkStripe(),
  ]);

  const services = { supabase, violet, stripe };
  const statuses = [supabase.status, violet.status, stripe.status];
  const downCount = statuses.filter((s) => s === "down").length;

  let overall_status: HealthCheckResult["overall_status"];
  if (downCount === 0) {
    overall_status = "healthy";
  } else if (downCount >= statuses.length) {
    overall_status = "down";
  } else {
    overall_status = "degraded";
  }

  const result: HealthCheckResult = {
    overall_status,
    services,
    checked_at: new Date().toISOString(),
  };

  return new Response(JSON.stringify({ data: result, error: null }), {
    status: 200,
    headers: jsonHeaders,
  });
});
