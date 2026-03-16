import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase.js", () => ({
  createSupabaseClient: vi.fn(),
}));

import { recordEvent, getUserEvents } from "../tracking.js";
import { createSupabaseClient } from "../supabase.js";
import type { TrackingEvent } from "../../types/tracking.types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockInsertClient(insertError?: { message: string } | null) {
  const insertFn = vi.fn().mockResolvedValue({
    error: insertError ?? null,
  });

  return {
    from: vi.fn().mockReturnValue({ insert: insertFn }),
    _insert: insertFn,
  };
}

/**
 * Creates a chainable mock that mimics the Supabase PostgREST query builder.
 * Every chainable method returns the same builder object, and `then` resolves
 * the query result — matching the real SupabaseClient behavior.
 */
function createMockSelectClient(
  data: Record<string, unknown>[] | null,
  error?: { message: string } | null,
) {
  const result = { data: data ?? [], error: error ?? null };

  // Chainable builder — every method returns itself, `then` resolves
  const builder: Record<string, unknown> = {};
  const chainableMethods = ["select", "eq", "order", "gte", "limit"];
  for (const method of chainableMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  // Make it thenable (await resolves to result)
  builder.then = (resolve: (v: unknown) => void) => resolve(result);

  return {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  };
}

// ─── recordEvent ──────────────────────────────────────────────────────────────

describe("recordEvent", () => {
  it("inserts event with correct payload", async () => {
    const mock = createMockInsertClient();
    const event: TrackingEvent = {
      event_type: "product_view",
      payload: { product_id: "abc-123" },
    };

    await recordEvent("user-1", event, mock as never);

    expect(mock.from).toHaveBeenCalledWith("user_events");
    expect(mock._insert).toHaveBeenCalledWith({
      user_id: "user-1",
      event_type: "product_view",
      payload: { product_id: "abc-123" },
    });
  });

  it("does not throw on insert error — logs warning instead", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mock = createMockInsertClient({ message: "RLS violation" });
    const event: TrackingEvent = {
      event_type: "search",
      payload: { query: "shoes", result_count: 5 },
    };

    await expect(recordEvent("user-1", event, mock as never)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith("[tracking] Failed to record event:", "RLS violation");
    consoleSpy.mockRestore();
  });

  it("handles category_view event type", async () => {
    const mock = createMockInsertClient();
    const event: TrackingEvent = {
      event_type: "category_view",
      payload: { category_id: "home", category_name: "Home & Living" },
    };

    await recordEvent("user-2", event, mock as never);

    expect(mock._insert).toHaveBeenCalledWith({
      user_id: "user-2",
      event_type: "category_view",
      payload: { category_id: "home", category_name: "Home & Living" },
    });
  });
});

// ─── getUserEvents ────────────────────────────────────────────────────────────

describe("getUserEvents", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseClient).mockReturnValue(createMockSelectClient([]) as never);
  });

  it("returns empty array when no events", async () => {
    const mock = createMockSelectClient([]);
    const result = await getUserEvents("user-1", undefined, mock as never);

    expect(mock.from).toHaveBeenCalledWith("user_events");
    expect(result).toEqual([]);
  });

  it("returns events from supabase", async () => {
    const events = [
      {
        id: "1",
        user_id: "u1",
        event_type: "product_view",
        payload: { product_id: "p1" },
        created_at: "2026-01-01",
      },
    ];
    const mock = createMockSelectClient(events);
    const result = await getUserEvents("u1", undefined, mock as never);

    expect(result).toEqual(events);
  });

  it("throws on query error", async () => {
    const mock = createMockSelectClient(null, { message: "DB error" });
    await expect(getUserEvents("u1", undefined, mock as never)).rejects.toEqual({
      message: "DB error",
    });
  });

  it("uses default browser client when no client provided", async () => {
    const mock = createMockSelectClient([]);
    vi.mocked(createSupabaseClient).mockReturnValue(mock as never);

    await getUserEvents("u1");
    expect(createSupabaseClient).toHaveBeenCalled();
  });
});
