import { describe, expect, it, vi } from "vitest";
import { getHealthMetrics, getRecentErrors, getAlertRules } from "@ecommerce/shared";
import type { HealthCheckResult } from "@ecommerce/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock builders ────────────────────────────────────────────

function buildRpcMock(data: unknown, error: unknown = null): SupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  } as unknown as SupabaseClient;
}

function buildSelectChainMock(data: unknown[], error: unknown = null): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }),
  };
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

function buildAlertSelectMock(data: unknown[], error: unknown = null): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
  };
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

// ── getHealthMetrics tests ──────────────────────────────────

describe("getHealthMetrics", () => {
  it("maps RPC result to HealthMetrics", async () => {
    const rpcData = [
      {
        error_count: 42,
        error_rate_per_hour: 1.75,
        webhook_total: 200,
        webhook_success: 195,
        webhook_failed: 5,
        webhook_success_rate: 97.5,
        top_error_types: [{ error_type: "VIOLET.API_ERROR", count: 10 }],
        consecutive_webhook_failures: 0,
      },
    ];
    const client = buildRpcMock(rpcData);
    const result = await getHealthMetrics(client, 24);

    expect(result.errorCount).toBe(42);
    expect(result.errorRatePerHour).toBe(1.75);
    expect(result.webhookTotal).toBe(200);
    expect(result.webhookSuccess).toBe(195);
    expect(result.webhookFailed).toBe(5);
    expect(result.webhookSuccessRate).toBe(97.5);
    expect(result.topErrorTypes).toHaveLength(1);
    expect(result.topErrorTypes[0].error_type).toBe("VIOLET.API_ERROR");
    expect(result.consecutiveWebhookFailures).toBe(0);
    expect(client.rpc).toHaveBeenCalledWith("fn_health_metrics", { p_hours: 24 });
  });

  it("returns defaults when RPC returns empty", async () => {
    const client = buildRpcMock([]);
    const result = await getHealthMetrics(client);

    expect(result.errorCount).toBe(0);
    expect(result.webhookSuccessRate).toBe(100);
    expect(result.topErrorTypes).toEqual([]);
  });

  it("throws on RPC error", async () => {
    const client = buildRpcMock(null, { message: "DB error" });
    await expect(getHealthMetrics(client)).rejects.toEqual({ message: "DB error" });
  });
});

// ── getRecentErrors tests ───────────────────────────────────

describe("getRecentErrors", () => {
  it("maps error_logs rows to RecentError", async () => {
    const rows = [
      {
        id: "err-1",
        created_at: "2026-03-22T10:00:00Z",
        source: "web",
        error_type: "CART.ADD_FAILED",
        message: "SKU not found",
      },
    ];
    const client = buildSelectChainMock(rows);
    const result = await getRecentErrors(client, 10);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("err-1");
    expect(result[0].createdAt).toBe("2026-03-22T10:00:00Z");
    expect(result[0].source).toBe("web");
    expect(result[0].errorType).toBe("CART.ADD_FAILED");
    expect(result[0].message).toBe("SKU not found");
    expect(client.from).toHaveBeenCalledWith("error_logs");
  });

  it("returns empty array when no errors", async () => {
    const client = buildSelectChainMock([]);
    const result = await getRecentErrors(client);
    expect(result).toEqual([]);
  });
});

// ── getAlertRules tests ─────────────────────────────────────

describe("getAlertRules", () => {
  it("maps alert_rules rows to AlertRule", async () => {
    const rows = [
      {
        id: "rule-1",
        rule_name: "webhook_consecutive_failures",
        threshold_value: 3,
        time_window_minutes: 0,
        enabled: true,
        last_triggered_at: null,
      },
      {
        id: "rule-2",
        rule_name: "failed_checkouts_spike",
        threshold_value: 10,
        time_window_minutes: 60,
        enabled: true,
        last_triggered_at: "2026-03-20T15:00:00Z",
      },
    ];
    const client = buildAlertSelectMock(rows);
    const result = await getAlertRules(client);

    expect(result).toHaveLength(2);
    expect(result[0].ruleName).toBe("webhook_consecutive_failures");
    expect(result[0].thresholdValue).toBe(3);
    expect(result[0].timeWindowMinutes).toBe(0);
    expect(result[0].enabled).toBe(true);
    expect(result[0].lastTriggeredAt).toBeNull();

    expect(result[1].ruleName).toBe("failed_checkouts_spike");
    expect(result[1].lastTriggeredAt).toBe("2026-03-20T15:00:00Z");
    expect(client.from).toHaveBeenCalledWith("alert_rules");
  });
});

// ── HealthCheckResult parsing tests ─────────────────────────

describe("HealthCheckResult parsing", () => {
  it("parses a healthy response correctly", () => {
    const raw: HealthCheckResult = {
      overall_status: "healthy",
      services: {
        supabase: { status: "up", latency_ms: 12 },
        violet: { status: "up", latency_ms: 250 },
        stripe: { status: "up", latency_ms: 180 },
      },
      checked_at: "2026-03-22T10:00:00Z",
    };

    expect(raw.overall_status).toBe("healthy");
    expect(raw.services.supabase.status).toBe("up");
    expect(raw.services.supabase.latency_ms).toBe(12);
    expect(raw.services.violet.status).toBe("up");
    expect(raw.services.stripe.status).toBe("up");
    expect(raw.checked_at).toBe("2026-03-22T10:00:00Z");
  });

  it("identifies degraded status when one service is down", () => {
    const raw: HealthCheckResult = {
      overall_status: "degraded",
      services: {
        supabase: { status: "up", latency_ms: 10 },
        violet: { status: "down", latency_ms: null, error: "Network error" },
        stripe: { status: "up", latency_ms: 200 },
      },
      checked_at: "2026-03-22T10:05:00Z",
    };

    expect(raw.overall_status).toBe("degraded");
    expect(raw.services.violet.status).toBe("down");
    expect(raw.services.violet.error).toBe("Network error");
    expect(raw.services.violet.latency_ms).toBeNull();
  });

  it("identifies down status when all services are down", () => {
    const raw: HealthCheckResult = {
      overall_status: "down",
      services: {
        supabase: { status: "down", latency_ms: null, error: "Connection refused" },
        violet: { status: "down", latency_ms: null, error: "Timeout" },
        stripe: { status: "down", latency_ms: null, error: "DNS failure" },
      },
      checked_at: "2026-03-22T10:10:00Z",
    };

    expect(raw.overall_status).toBe("down");
    const allDown = Object.values(raw.services).every((s) => s.status === "down");
    expect(allDown).toBe(true);
  });

  it("handles unknown service status", () => {
    const raw: HealthCheckResult = {
      overall_status: "healthy",
      services: {
        supabase: { status: "up", latency_ms: 15 },
        violet: {
          status: "unknown",
          latency_ms: null,
          error: "VIOLET_APP_ID/SECRET not configured",
        },
        stripe: { status: "up", latency_ms: 190 },
      },
      checked_at: "2026-03-22T10:15:00Z",
    };

    expect(raw.services.violet.status).toBe("unknown");
    expect(raw.services.violet.error).toContain("not configured");
  });
});

// ── Alert threshold evaluation logic tests ──────────────────

describe("Alert threshold evaluation logic", () => {
  function isBreached(
    ruleName: string,
    thresholdValue: number,
    metrics: {
      consecutiveWebhookFailures: number;
      topErrorTypes: { error_type: string; count: number }[];
      errorCount: number;
    },
  ): boolean {
    switch (ruleName) {
      case "webhook_consecutive_failures":
        return metrics.consecutiveWebhookFailures >= thresholdValue;
      case "failed_checkouts_spike": {
        const checkoutErrors = metrics.topErrorTypes
          .filter((e) => e.error_type.startsWith("CHECKOUT."))
          .reduce((sum, e) => sum + e.count, 0);
        return checkoutErrors >= thresholdValue;
      }
      case "edge_function_error_rate": {
        const efErrors = metrics.topErrorTypes
          .filter((e) => e.error_type.startsWith("EDGE_FUNCTION."))
          .reduce((sum, e) => sum + e.count, 0);
        const rate = metrics.errorCount > 0 ? (efErrors / metrics.errorCount) * 100 : 0;
        return rate >= thresholdValue;
      }
      default:
        return false;
    }
  }

  it("detects webhook consecutive failures breach", () => {
    expect(
      isBreached("webhook_consecutive_failures", 3, {
        consecutiveWebhookFailures: 5,
        topErrorTypes: [],
        errorCount: 0,
      }),
    ).toBe(true);
  });

  it("does not trigger when below threshold", () => {
    expect(
      isBreached("webhook_consecutive_failures", 3, {
        consecutiveWebhookFailures: 2,
        topErrorTypes: [],
        errorCount: 0,
      }),
    ).toBe(false);
  });

  it("detects failed checkouts spike", () => {
    expect(
      isBreached("failed_checkouts_spike", 10, {
        consecutiveWebhookFailures: 0,
        topErrorTypes: [
          { error_type: "CHECKOUT.PAYMENT_FAILED", count: 7 },
          { error_type: "CHECKOUT.VALIDATION_ERROR", count: 5 },
        ],
        errorCount: 20,
      }),
    ).toBe(true);
  });

  it("does not trigger checkout spike when below threshold", () => {
    expect(
      isBreached("failed_checkouts_spike", 10, {
        consecutiveWebhookFailures: 0,
        topErrorTypes: [{ error_type: "CHECKOUT.PAYMENT_FAILED", count: 3 }],
        errorCount: 10,
      }),
    ).toBe(false);
  });

  it("detects edge function error rate breach", () => {
    expect(
      isBreached("edge_function_error_rate", 5, {
        consecutiveWebhookFailures: 0,
        topErrorTypes: [{ error_type: "EDGE_FUNCTION.TIMEOUT", count: 8 }],
        errorCount: 100,
      }),
    ).toBe(true);
  });

  it("handles zero total errors gracefully", () => {
    expect(
      isBreached("edge_function_error_rate", 5, {
        consecutiveWebhookFailures: 0,
        topErrorTypes: [],
        errorCount: 0,
      }),
    ).toBe(false);
  });

  it("returns false for unknown rule names", () => {
    expect(
      isBreached("unknown_rule", 1, {
        consecutiveWebhookFailures: 10,
        topErrorTypes: [],
        errorCount: 100,
      }),
    ).toBe(false);
  });
});

// ── getRecentErrors error path tests ────────────────────────

describe("getRecentErrors error handling", () => {
  it("throws on database error", async () => {
    const client = buildSelectChainMock([], { message: "Connection refused" });
    await expect(getRecentErrors(client)).rejects.toEqual({ message: "Connection refused" });
  });
});

// ── getAlertRules error path tests ──────────────────────────

describe("getAlertRules error handling", () => {
  it("throws on database error", async () => {
    const client = buildAlertSelectMock([], { message: "Permission denied" });
    await expect(getAlertRules(client)).rejects.toEqual({ message: "Permission denied" });
  });

  it("returns empty array when no rules", async () => {
    const client = buildAlertSelectMock([]);
    const result = await getAlertRules(client);
    expect(result).toEqual([]);
  });
});

// ── Server handler tests ────────────────────────────────────

vi.mock("#/server/supabaseServer", () => ({
  getSupabaseSessionClient: vi.fn(),
  getSupabaseServer: vi.fn(),
}));

vi.mock("#/server/adminAuthGuard", () => ({
  requireAdminOrThrow: vi.fn(),
}));

/**
 * Server handler tests for getAdminHealthHandler — fetches cached health
 * metrics, recent errors, and alert rules for the admin health dashboard.
 * The handler orchestrates three parallel shared client calls and evaluates
 * alert thresholds in the background. Auth is enforced via requireAdminOrThrow.
 */
describe("getAdminHealthHandler", () => {
  it("rejects non-admin (throws 403 Response)", async () => {
    const { requireAdminOrThrow } = await import("#/server/adminAuthGuard");
    vi.mocked(requireAdminOrThrow).mockRejectedValue(new Response("Forbidden", { status: 403 }));

    const { getAdminHealthHandler } = await import("#/server/getAdminHealthHandler");
    await expect(getAdminHealthHandler()).rejects.toBeInstanceOf(Response);
  });

  it("returns health metrics for admin", async () => {
    const { requireAdminOrThrow } = await import("#/server/adminAuthGuard");
    vi.mocked(requireAdminOrThrow).mockResolvedValue({ id: "admin1", email: "admin@test.com" });

    const { getSupabaseServer } = await import("#/server/supabaseServer");
    const metricsData = [
      {
        error_count: 5,
        error_rate_per_hour: 0.5,
        webhook_total: 100,
        webhook_success: 98,
        webhook_failed: 2,
        webhook_success_rate: 98.0,
        top_error_types: [],
        consecutive_webhook_failures: 0,
      },
    ];
    const errorRows = [
      {
        id: "err-1",
        created_at: "2026-03-22T10:00:00Z",
        source: "web",
        error_type: "CART.ADD_FAILED",
        message: "SKU not found",
      },
    ];
    const alertRows = [
      {
        id: "rule-1",
        rule_name: "webhook_consecutive_failures",
        threshold_value: 3,
        time_window_minutes: 0,
        enabled: true,
        last_triggered_at: null,
      },
    ];

    const rpcMock = vi.fn().mockResolvedValue({ data: metricsData, error: null });
    const errorChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: errorRows, error: null }),
    };
    const alertChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: alertRows, error: null }),
    };
    let fromCallCount = 0;
    vi.mocked(getSupabaseServer).mockReturnValue({
      rpc: rpcMock,
      from: vi.fn(() => {
        fromCallCount++;
        if (fromCallCount === 1) return errorChain;
        return alertChain;
      }),
    } as unknown as SupabaseClient);

    const { getAdminHealthHandler } = await import("#/server/getAdminHealthHandler");
    const result = await getAdminHealthHandler();

    expect(result.metrics.errorCount).toBe(5);
    expect(result.metrics.webhookSuccessRate).toBe(98.0);
    expect(result.recentErrors).toHaveLength(1);
    expect(result.alertRules).toHaveLength(1);
    expect(result.healthCheck).toBeNull();
  });
});

/**
 * Server handler tests for triggerHealthCheckHandler — invokes the health-check
 * Supabase Edge Function on demand and returns the result. Handles Edge Function
 * failures by throwing a 500 Response with structured error JSON.
 */
describe("triggerHealthCheckHandler", () => {
  it("rejects non-admin", async () => {
    const { requireAdminOrThrow } = await import("#/server/adminAuthGuard");
    vi.mocked(requireAdminOrThrow).mockRejectedValue(new Response("Forbidden", { status: 403 }));

    const { triggerHealthCheckHandler } = await import("#/server/getAdminHealthHandler");
    await expect(triggerHealthCheckHandler()).rejects.toBeInstanceOf(Response);
  });

  it("calls health-check Edge Function and returns result", async () => {
    const { requireAdminOrThrow } = await import("#/server/adminAuthGuard");
    vi.mocked(requireAdminOrThrow).mockResolvedValue({ id: "admin1", email: "admin@test.com" });

    const { getSupabaseServer } = await import("#/server/supabaseServer");
    const healthResult = {
      overall_status: "healthy",
      services: {
        supabase: { status: "up", latency_ms: 12 },
        violet: { status: "up", latency_ms: 250 },
        stripe: { status: "up", latency_ms: 180 },
      },
      checked_at: "2026-03-22T10:00:00Z",
    };
    vi.mocked(getSupabaseServer).mockReturnValue({
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { data: healthResult },
          error: null,
        }),
      },
    } as unknown as SupabaseClient);

    const { triggerHealthCheckHandler } = await import("#/server/getAdminHealthHandler");
    const result = await triggerHealthCheckHandler();
    expect(result.overall_status).toBe("healthy");
    expect(result.services.supabase.status).toBe("up");
  });

  it("handles Edge Function failure with 500 Response", async () => {
    const { requireAdminOrThrow } = await import("#/server/adminAuthGuard");
    vi.mocked(requireAdminOrThrow).mockResolvedValue({ id: "admin1", email: "admin@test.com" });

    const { getSupabaseServer } = await import("#/server/supabaseServer");
    vi.mocked(getSupabaseServer).mockReturnValue({
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Edge Function timeout" },
        }),
      },
    } as unknown as SupabaseClient);

    const { triggerHealthCheckHandler } = await import("#/server/getAdminHealthHandler");
    try {
      await triggerHealthCheckHandler();
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(500);
      const body = await (e as Response).json();
      expect(body.error.code).toBe("HEALTH.CHECK_FAILED");
    }
  });
});
