/**
 * Edge Function: health-check
 *
 * Provides a /health endpoint that checks connectivity to external services:
 * Supabase (DB query), Violet.io (API reachability), Stripe (key validation),
 * and merchant Connection Health via Violet's Operations API.
 *
 * ## Authentication
 * Uses a shared secret via Authorization Bearer token (HEALTH_CHECK_SECRET).
 * This allows external uptime monitors (UptimeRobot, Pingdom) to call this
 * endpoint without needing Supabase JWTs.
 *
 * ## Merchant Connection Health
 * Uses GET /operations/connection_health (batch endpoint) to fetch all merchants'
 * health in a single API call. Only merchants with non-COMPLETE status are included
 * in the response, with full sub-check details (Connection, Scopes, Sync, etc.).
 *
 * @see https://docs.violet.io/prism/violet-connect/guides/connection-health
 * @see https://docs.violet.io/api-reference/operations/connection/get-connection-health
 *
 * ## Response
 * Returns HealthCheckResult with per-service status and overall health.
 * Individual service failures don't crash the function — each is independent.
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { fetchWithRetryRaw } from "../_shared/fetchWithRetry.ts";

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
  /** Connection Health for each connected merchant (Violet API). */
  merchants?: Array<{
    merchant_id: number;
    name: string;
    status: string;
  }>;
  checked_at: string;
}

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

/**
 * A single sub-check within a merchant's Connection Health report.
 *
 * Violet checks 7 areas per merchant: Connection, Scopes, Sync Status,
 * Invalid Products, Offers Published, Payout Account, Commission Rate.
 * Each can be COMPLETE (green), INCOMPLETE (yellow), or NEEDS_ATTENTION (red).
 *
 * @see https://docs.violet.io/prism/violet-connect/guides/connection-health
 */
interface ConnectionHealthCheck {
  /** Machine-readable check identifier (e.g., "connection", "scopes", "sync_status") */
  type: string;
  /** Human-readable label for display in the admin dashboard */
  label: string;
  /** Current state of this sub-check */
  status: "COMPLETE" | "INCOMPLETE" | "NEEDS_ATTENTION" | "UNKNOWN";
  /** Optional guidance message when status is not COMPLETE */
  message?: string;
}

/**
 * Connection Health summary for a single merchant.
 *
 * Maps from Violet's ConnectionHealth response. Only merchants with
 * non-COMPLETE overall status are included in the health-check response.
 *
 * @see https://docs.violet.io/api-reference/operations/connection/get-connection-health
 */
interface MerchantConnectionHealth {
  merchant_id: number;
  merchant_name: string;
  /** Overall status across all sub-checks */
  overall_status: "COMPLETE" | "INCOMPLETE" | "NEEDS_ATTENTION" | "UNKNOWN";
  /** Detailed sub-check results */
  checks: ConnectionHealthCheck[];
}

/**
 * Fetches Connection Health for all connected merchants from Violet API.
 *
 * ## Strategy: batch endpoint
 * Uses GET /operations/connection_health to fetch ALL merchants' health
 * in a **single API call** instead of N+1 calls (GET /merchants + N × GET per-merchant).
 * This reduces latency, avoids rate limiting, and aligns with Violet's
 * documented API surface.
 *
 * ## Filtering
 * Only merchants with non-COMPLETE overall status are returned.
 * Healthy merchants add noise without actionable value.
 *
 * @see https://docs.violet.io/api-reference/operations/connection/get-connection-health
 * @see https://docs.violet.io/prism/violet-connect/guides/connection-health
 */
async function checkMerchantConnectionHealth(): Promise<
  MerchantConnectionHealth[] | null
> {
  const appId = Deno.env.get("VIOLET_APP_ID");
  const appSecret = Deno.env.get("VIOLET_APP_SECRET");
  const apiBase = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io";

  if (!appId || !appSecret) return null;

  try {
    // First, login to get a token
    const loginRes = await fetchWithRetryRaw(`${apiBase}/v1/login`, {
      method: "POST",
      headers: {
        "X-Violet-App-Id": appId,
        "X-Violet-App-Secret": appSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: Deno.env.get("VIOLET_USERNAME"),
        password: Deno.env.get("VIOLET_PASSWORD"),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!loginRes.ok) return null;
    const { token } = await loginRes.json();
    if (!token) return null;

    // Batch endpoint: GET /operations/connection_health
    // Returns health for ALL connected merchants in one call.
    const healthRes = await fetchWithRetryRaw(
      `${apiBase}/v1/operations/connection_health`,
      {
        method: "GET",
        headers: {
          "X-Violet-App-Id": appId,
          "X-Violet-App-Secret": appSecret,
          "X-Violet-Token": token,
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!healthRes.ok) {
      // Fallback: if batch endpoint fails (e.g., not yet available in sandbox),
      // return null rather than failing the entire health check
      return null;
    }

    const healthData = await healthRes.json();

    // The response can be an array directly or wrapped in a content array
    const reports: Array<Record<string, unknown>> = Array.isArray(healthData)
      ? healthData
      : (healthData?.content ?? []);

    if (reports.length === 0) return [];

    /**
     * Map Violet's sub-check field names to human-readable labels.
     * Violet's API returns check objects with a `type` field.
     *
     * @see https://docs.violet.io/prism/violet-connect/guides/connection-health
     */
    const checkLabelMap: Record<string, string> = {
      connection: "Store Connection",
      scopes: "API Scopes",
      sync_status: "Product Sync",
      invalid_products: "Invalid Products",
      offers_published: "Published Offers",
      payout_account: "Payout Account",
      commission_rate: "Commission Rate",
    };

    const results: MerchantConnectionHealth[] = reports
      .map((report) => {
        const overallStatus = String(
          report.overall_status ?? report.status ?? "UNKNOWN",
        ).toUpperCase() as MerchantConnectionHealth["overall_status"];

        // Extract sub-checks from Violet's response
        // The exact structure varies; Violet may return checks as an array or as top-level fields
        const rawChecks = Array.isArray(report.checks)
          ? report.checks
          : Array.isArray(report.connection_health_checks)
            ? report.connection_health_checks
            : [];

        const checks: ConnectionHealthCheck[] = rawChecks.map(
          (check: Record<string, unknown>) => ({
            type: String(check.type ?? check.name ?? "unknown"),
            label: checkLabelMap[String(check.type ?? check.name ?? "")] ??
              String(check.label ?? check.name ?? "Unknown"),
            status: normalizeStatus(String(check.status ?? "UNKNOWN")),
            message: check.message ? String(check.message) : undefined,
          }),
        );

        return {
          merchant_id: Number(report.merchant_id ?? 0),
          merchant_name: String(report.merchant_name ?? "Unknown"),
          overall_status: overallStatus,
          checks,
        };
      })
      // Only return merchants that need attention (non-COMPLETE)
      .filter((m) => m.overall_status !== "COMPLETE");

    return results;
  } catch {
    return null;
  }
}

/**
 * Normalizes Violet's status strings to our canonical enum values.
 */
function normalizeStatus(
  raw: string,
): "COMPLETE" | "INCOMPLETE" | "NEEDS_ATTENTION" | "UNKNOWN" {
  const upper = raw.toUpperCase();
  if (upper === "COMPLETE" || upper === "GREEN") return "COMPLETE";
  if (upper === "INCOMPLETE" || upper === "YELLOW") return "INCOMPLETE";
  if (upper === "NEEDS_ATTENTION" || upper === "RED") return "NEEDS_ATTENTION";
  return "UNKNOWN";
}

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
    const res = await fetchWithRetryRaw(`${apiBase}/v1/catalog/categories`, {
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
  const [supabase, violet, stripe, merchants] = await Promise.all([
    checkSupabase(),
    checkViolet(),
    checkStripe(),
    checkMerchantConnectionHealth(),
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
    merchants: merchants ?? undefined,
    checked_at: new Date().toISOString(),
  };

  return new Response(JSON.stringify({ data: result, error: null }), {
    status: 200,
    headers: jsonHeaders,
  });
});
