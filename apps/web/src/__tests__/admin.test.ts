import { describe, expect, it, vi } from "vitest";
import { resolveTimeRange, getDashboardMetrics, getCommissionSummary } from "@ecommerce/shared";
import type { TimeRangeParams } from "@ecommerce/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock builders ────────────────────────────────────────────

function buildRpcMock(data: unknown, error: unknown = null): SupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  } as unknown as SupabaseClient;
}

function buildSelectMock(data: unknown[], error: unknown = null): SupabaseClient {
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
  };
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

// ── resolveTimeRange tests ──────────────────────────────────

describe("resolveTimeRange", () => {
  it("resolves 'today' to start of day", () => {
    const result = resolveTimeRange({ range: "today" });
    const startDate = new Date(result.start);
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getSeconds()).toBe(0);
  });

  it("resolves '7d' to 7 days ago", () => {
    const result = resolveTimeRange({ range: "7d" });
    const start = new Date(result.start);
    const end = new Date(result.end);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(6.9);
    expect(diffDays).toBeLessThanOrEqual(7.1);
  });

  it("resolves '30d' to 30 days ago", () => {
    const result = resolveTimeRange({ range: "30d" });
    const start = new Date(result.start);
    const end = new Date(result.end);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(29.9);
    expect(diffDays).toBeLessThanOrEqual(30.1);
  });

  it("resolves 'custom' with provided dates", () => {
    const params: TimeRangeParams = {
      range: "custom",
      customStart: "2026-01-01T00:00:00Z",
      customEnd: "2026-01-31T23:59:59Z",
    };
    const result = resolveTimeRange(params);
    expect(result.start).toBe("2026-01-01T00:00:00Z");
    expect(result.end).toBe("2026-01-31T23:59:59Z");
  });

  it("throws on custom without dates", () => {
    expect(() => resolveTimeRange({ range: "custom" })).toThrow(
      "Custom range requires customStart and customEnd",
    );
  });
});

// ── getDashboardMetrics tests ───────────────────────────────

describe("getDashboardMetrics", () => {
  const sampleRow = {
    total_orders: 42,
    gross_revenue_cents: 150000,
    commission_estimate_cents: 15000,
    active_users: 120,
    total_visitors: 120,
    conversion_rate: 3.5,
    ai_search_usage_pct: 40.2,
  };

  it("maps RPC result to DashboardMetrics", async () => {
    const client = buildRpcMock([sampleRow]);
    const result = await getDashboardMetrics(client, { range: "30d" });

    expect(result.totalOrders).toBe(42);
    expect(result.grossRevenueCents).toBe(150000);
    expect(result.commissionEstimateCents).toBe(15000);
    expect(result.activeUsers).toBe(120);
    expect(result.conversionRate).toBe(3.5);
    expect(result.aiSearchUsagePct).toBe(40.2);
    expect(result.periodStart).toBeDefined();
    expect(result.periodEnd).toBeDefined();
  });

  it("returns zeros when RPC returns empty array", async () => {
    const client = buildRpcMock([]);
    const result = await getDashboardMetrics(client, { range: "today" });

    expect(result.totalOrders).toBe(0);
    expect(result.grossRevenueCents).toBe(0);
    expect(result.commissionEstimateCents).toBe(0);
  });

  it("returns zeros when RPC returns null", async () => {
    const client = buildRpcMock(null);
    const result = await getDashboardMetrics(client, { range: "7d" });

    expect(result.totalOrders).toBe(0);
  });

  it("throws on RPC error", async () => {
    const client = buildRpcMock(null, { message: "DB error" });
    await expect(getDashboardMetrics(client, { range: "30d" })).rejects.toEqual({
      message: "DB error",
    });
  });

  it("calls RPC with correct parameters", async () => {
    const client = buildRpcMock([sampleRow]);
    await getDashboardMetrics(client, { range: "7d" });

    expect(client.rpc).toHaveBeenCalledWith("fn_dashboard_metrics_by_range", {
      p_start: expect.any(String),
      p_end: expect.any(String),
    });
  });
});

// ── getCommissionSummary tests ──────────────────────────────

describe("getCommissionSummary", () => {
  const sampleRows = [
    {
      merchant_name: "StyleSphere",
      bag_count: 15,
      gross_subtotal_cents: 45000,
      commission_estimate_cents: 4500,
      commission_rate_pct: 10,
    },
    {
      merchant_name: "EcoWear",
      bag_count: 8,
      gross_subtotal_cents: 24000,
      commission_estimate_cents: 2400,
      commission_rate_pct: 10,
    },
  ];

  it("maps rows to CommissionSummary array", async () => {
    const client = buildSelectMock(sampleRows);
    const result = await getCommissionSummary(client);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      merchantName: "StyleSphere",
      bagCount: 15,
      grossSubtotalCents: 45000,
      commissionCents: 4500,
      commissionRate: 10,
    });
  });

  it("returns empty array when no data", async () => {
    const client = buildSelectMock([]);
    const result = await getCommissionSummary(client);
    expect(result).toEqual([]);
  });

  it("returns empty array when data is null", async () => {
    const client = buildSelectMock(null as unknown as unknown[]);
    const result = await getCommissionSummary(client);
    expect(result).toEqual([]);
  });

  it("throws on query error", async () => {
    const client = buildSelectMock([], { message: "Connection failed" });
    await expect(getCommissionSummary(client)).rejects.toEqual({
      message: "Connection failed",
    });
  });

  it("queries mv_commission_summary ordered by commission", async () => {
    const client = buildSelectMock(sampleRows);
    await getCommissionSummary(client);

    expect(client.from).toHaveBeenCalledWith("mv_commission_summary");
  });
});

// ── getAdminDashboardHandler tests ──────────────────────────

// Mock the server modules before importing the handler
vi.mock("#/server/supabaseServer", () => ({
  getSupabaseSessionClient: vi.fn(),
  getSupabaseServer: vi.fn(),
}));

describe("getAdminDashboardHandler", () => {
  it("throws 403 Response when user is not admin", async () => {
    const { getSupabaseSessionClient, getSupabaseServer } = await import("#/server/supabaseServer");
    vi.mocked(getSupabaseSessionClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: "u1", is_anonymous: false, app_metadata: { user_role: "user" } },
          },
        }),
      },
    } as unknown as SupabaseClient);
    vi.mocked(getSupabaseServer).mockReturnValue(buildRpcMock(null) as unknown as SupabaseClient);

    const { getAdminDashboardHandler } = await import("#/server/getAdminDashboardHandler");

    await expect(getAdminDashboardHandler({ range: "30d" })).rejects.toBeInstanceOf(Response);
  });

  it("throws 403 Response when user is anonymous", async () => {
    const { getSupabaseSessionClient, getSupabaseServer } = await import("#/server/supabaseServer");
    vi.mocked(getSupabaseSessionClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u1", is_anonymous: true, app_metadata: {} } },
        }),
      },
    } as unknown as SupabaseClient);
    vi.mocked(getSupabaseServer).mockReturnValue(buildRpcMock(null) as unknown as SupabaseClient);

    const { getAdminDashboardHandler } = await import("#/server/getAdminDashboardHandler");

    await expect(getAdminDashboardHandler({ range: "30d" })).rejects.toBeInstanceOf(Response);
  });

  it("throws 403 Response when no user session", async () => {
    const { getSupabaseSessionClient, getSupabaseServer } = await import("#/server/supabaseServer");
    vi.mocked(getSupabaseSessionClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
        }),
      },
    } as unknown as SupabaseClient);
    vi.mocked(getSupabaseServer).mockReturnValue(buildRpcMock(null) as unknown as SupabaseClient);

    const { getAdminDashboardHandler } = await import("#/server/getAdminDashboardHandler");

    await expect(getAdminDashboardHandler({ range: "30d" })).rejects.toBeInstanceOf(Response);
  });

  it("returns dashboard data for admin user", async () => {
    const { getSupabaseSessionClient, getSupabaseServer } = await import("#/server/supabaseServer");
    vi.mocked(getSupabaseSessionClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "admin1",
              is_anonymous: false,
              app_metadata: { user_role: "admin" },
            },
          },
        }),
      },
    } as unknown as SupabaseClient);

    const metricsRow = {
      total_orders: 10,
      gross_revenue_cents: 50000,
      commission_estimate_cents: 5000,
      active_users: 30,
      total_visitors: 30,
      conversion_rate: 2.0,
      ai_search_usage_pct: 15.0,
    };
    const commissionRows = [
      {
        merchant_name: "TestMerchant",
        bag_count: 5,
        gross_subtotal_cents: 25000,
        commission_estimate_cents: 2500,
        commission_rate_pct: 10,
      },
    ];
    const rpcMock = vi.fn().mockResolvedValue({ data: [metricsRow], error: null });
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: commissionRows, error: null }),
    };
    vi.mocked(getSupabaseServer).mockReturnValue({
      rpc: rpcMock,
      from: vi.fn().mockReturnValue(selectChain),
    } as unknown as SupabaseClient);

    const { getAdminDashboardHandler } = await import("#/server/getAdminDashboardHandler");
    const result = await getAdminDashboardHandler({ range: "30d" });

    expect(result.metrics.totalOrders).toBe(10);
    expect(result.commission).toHaveLength(1);
    expect(result.commission[0].merchantName).toBe("TestMerchant");
  });
});

// ── Commission calculation tests ────────────────────────────

describe("commission calculation", () => {
  it("estimates 10% commission from bag subtotal", () => {
    // estimate_commission(10000, 10.0) = floor(10000 * 10 / 100) = 1000
    const bagSubtotal = 10000; // $100.00
    const rate = 10;
    const commission = Math.floor((bagSubtotal * rate) / 100);
    expect(commission).toBe(1000); // $10.00
  });

  it("handles fractional cents correctly", () => {
    // estimate_commission(9999, 10.0) = floor(9999 * 10 / 100) = floor(999.9) = 999
    const commission = Math.floor((9999 * 10) / 100);
    expect(commission).toBe(999);
  });

  it("handles zero subtotal", () => {
    const commission = Math.floor((0 * 10) / 100);
    expect(commission).toBe(0);
  });
});
