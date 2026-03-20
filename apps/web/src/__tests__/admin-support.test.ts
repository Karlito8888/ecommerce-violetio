import { describe, expect, it, vi } from "vitest";
import {
  getSupportInquiries,
  getSupportInquiry,
  updateInquiryStatus,
  updateInternalNotes,
  getLinkedOrder,
} from "@ecommerce/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Mock builders ────────────────────────────────────────────

const SAMPLE_ROW = {
  id: "uuid-1",
  name: "Jane Doe",
  email: "jane@example.com",
  subject: "Order Issue",
  message: "My order is missing an item and I need help.",
  order_id: "violet-123",
  status: "new",
  internal_notes: null,
  created_at: "2026-03-20T10:00:00Z",
  updated_at: "2026-03-20T10:00:00Z",
};

const SAMPLE_ROW_2 = {
  ...SAMPLE_ROW,
  id: "uuid-2",
  name: "John Smith",
  email: "john@example.com",
  subject: "General Question",
  status: "resolved",
  order_id: null,
};

function buildSelectMock(data: unknown[], error: unknown = null): SupabaseClient {
  // Supabase query builder is thenable — `await builder` resolves the query.
  // Mock the full chain: from → select → order → eq (optional) → then.
  const result = { data, error };
  const chain = {
    select: vi.fn(),
    order: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: data[0] ?? null, error }),
    then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
  };
  chain.select.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

function buildUpdateMock(error: unknown = null): SupabaseClient {
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error }),
  };
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
}

// ── getSupportInquiries ─────────────────────────────────────

describe("getSupportInquiries", () => {
  it("returns mapped inquiries from database", async () => {
    const client = buildSelectMock([SAMPLE_ROW, SAMPLE_ROW_2]);
    const result = await getSupportInquiries(client);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("uuid-1");
    expect(result[0].name).toBe("Jane Doe");
    expect(result[0].orderId).toBe("violet-123");
    expect(result[0].status).toBe("new");
    expect(result[0].internalNotes).toBeNull();
    expect(result[1].id).toBe("uuid-2");
    expect(result[1].orderId).toBeNull();
  });

  it("returns empty array when no inquiries", async () => {
    const client = buildSelectMock([]);
    const result = await getSupportInquiries(client);
    expect(result).toEqual([]);
  });

  it("applies status filter", async () => {
    const result = { data: [SAMPLE_ROW], error: null };
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await getSupportInquiries(client, { status: "new" });
    expect(chain.eq).toHaveBeenCalledWith("status", "new");
  });

  it("applies subject filter", async () => {
    const result = { data: [SAMPLE_ROW], error: null };
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await getSupportInquiries(client, { subject: "Order Issue" });
    expect(chain.eq).toHaveBeenCalledWith("subject", "Order Issue");
  });

  it("applies both status and subject filters simultaneously", async () => {
    const result = { data: [SAMPLE_ROW], error: null };
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await getSupportInquiries(client, { status: "new", subject: "Order Issue" });
    expect(chain.eq).toHaveBeenCalledWith("status", "new");
    expect(chain.eq).toHaveBeenCalledWith("subject", "Order Issue");
    expect(chain.eq).toHaveBeenCalledTimes(2);
  });

  it("applies no filters when filters object is empty", async () => {
    const result = { data: [], error: null };
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) => resolve(result)),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await getSupportInquiries(client, {});
    expect(chain.eq).not.toHaveBeenCalled();
  });

  it("throws on database error", async () => {
    const client = buildSelectMock([], { message: "DB error" });
    await expect(getSupportInquiries(client)).rejects.toEqual({ message: "DB error" });
  });
});

// ── getSupportInquiry ───────────────────────────────────────

describe("getSupportInquiry", () => {
  it("returns a single mapped inquiry", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: SAMPLE_ROW, error: null }),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    const result = await getSupportInquiry(client, "uuid-1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("uuid-1");
    expect(result!.email).toBe("jane@example.com");
    expect(result!.subject).toBe("Order Issue");
    expect(result!.createdAt).toBe("2026-03-20T10:00:00Z");
  });

  it("returns null when inquiry not found (PGRST116)", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "PGRST116", message: "Not found" } }),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    const result = await getSupportInquiry(client, "nonexistent");
    expect(result).toBeNull();
  });

  it("throws on unexpected database error", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "42P01", message: "Table not found" } }),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await expect(getSupportInquiry(client, "uuid-1")).rejects.toEqual({
      code: "42P01",
      message: "Table not found",
    });
  });
});

// ── updateInquiryStatus ─────────────────────────────────────

describe("updateInquiryStatus", () => {
  it("returns true on successful status update", async () => {
    const client = buildUpdateMock(null);
    const result = await updateInquiryStatus(client, "uuid-1", "in-progress");
    expect(result).toBe(true);
  });

  it("returns false on database error", async () => {
    const client = buildUpdateMock({ message: "Update failed" });
    const result = await updateInquiryStatus(client, "uuid-1", "resolved");
    expect(result).toBe(false);
  });

  it("supports all status transitions", async () => {
    const transitions: [string, string][] = [
      ["new", "in-progress"],
      ["in-progress", "resolved"],
      ["new", "resolved"],
      ["resolved", "in-progress"],
    ];

    for (const [_from, to] of transitions) {
      const client = buildUpdateMock(null);
      const result = await updateInquiryStatus(client, "uuid-1", to as "in-progress" | "resolved");
      expect(result).toBe(true);
    }
  });
});

// ── updateInternalNotes ─────────────────────────────────────

describe("updateInternalNotes", () => {
  it("returns true on successful notes update", async () => {
    const client = buildUpdateMock(null);
    const result = await updateInternalNotes(client, "uuid-1", "Admin investigated this");
    expect(result).toBe(true);
  });

  it("returns false on database error", async () => {
    const client = buildUpdateMock({ message: "Update failed" });
    const result = await updateInternalNotes(client, "uuid-1", "Notes");
    expect(result).toBe(false);
  });
});

// ── getLinkedOrder ──────────────────────────────────────────

describe("getLinkedOrder", () => {
  it("returns linked order info when found", async () => {
    const orderRow = {
      id: "order-uuid",
      violet_order_id: "violet-123",
      status: "COMPLETED",
      total: 5999,
      created_at: "2026-03-18T12:00:00Z",
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: orderRow, error: null }),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    const result = await getLinkedOrder(client, "violet-123");
    expect(result).not.toBeNull();
    expect(result!.violetOrderId).toBe("violet-123");
    expect(result!.status).toBe("COMPLETED");
    expect(result!.total).toBe(5999);
  });

  it("returns null when order not found", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    const result = await getLinkedOrder(client, "nonexistent");
    expect(result).toBeNull();
  });

  it("queries orders table using violet_order_id", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
    };
    const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

    await getLinkedOrder(client, "violet-456");
    expect(client.from).toHaveBeenCalledWith("orders");
    expect(chain.eq).toHaveBeenCalledWith("violet_order_id", "violet-456");
  });
});

// ── Row mapping ─────────────────────────────────────────────

describe("row mapping (via getSupportInquiries)", () => {
  it("correctly maps snake_case to camelCase", async () => {
    const row = {
      ...SAMPLE_ROW,
      internal_notes: "Some admin notes",
      order_id: "violet-999",
    };
    const client = buildSelectMock([row]);
    const [result] = await getSupportInquiries(client);

    expect(result.internalNotes).toBe("Some admin notes");
    expect(result.orderId).toBe("violet-999");
    expect(result.createdAt).toBe("2026-03-20T10:00:00Z");
    expect(result.updatedAt).toBe("2026-03-20T10:00:00Z");
  });

  it("maps null order_id to null orderId", async () => {
    const row = { ...SAMPLE_ROW, order_id: null };
    const client = buildSelectMock([row]);
    const [result] = await getSupportInquiries(client);
    expect(result.orderId).toBeNull();
  });

  it("maps null internal_notes to null internalNotes", async () => {
    const client = buildSelectMock([SAMPLE_ROW]);
    const [result] = await getSupportInquiries(client);
    expect(result.internalNotes).toBeNull();
  });
});

// ── SUPPORT_STATUSES constant ───────────────────────────────

describe("SUPPORT_STATUSES", () => {
  it("contains all three valid statuses", async () => {
    const { SUPPORT_STATUSES } = await import("@ecommerce/shared");
    expect(SUPPORT_STATUSES).toEqual(["new", "in-progress", "resolved"]);
  });
});

// ── Status validation in updateSupportStatusHandler ─────────

describe("SUPPORT_STATUSES validation", () => {
  it("includes exactly the expected status workflow values", async () => {
    const { SUPPORT_STATUSES } = await import("@ecommerce/shared");
    expect(SUPPORT_STATUSES).toContain("new");
    expect(SUPPORT_STATUSES).toContain("in-progress");
    expect(SUPPORT_STATUSES).toContain("resolved");
    expect(SUPPORT_STATUSES).toHaveLength(3);
  });
});
