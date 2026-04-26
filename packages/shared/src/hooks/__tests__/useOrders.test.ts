import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ordersQueryOptions,
  orderDetailQueryOptions,
  createOrdersRealtimeChannel,
} from "../useOrders.js";
import { queryKeys } from "../../utils/constants.js";

// ─── ordersQueryOptions ───────────────────────────────────────────────────────

describe("ordersQueryOptions", () => {
  it("returns queryKeys.orders.list() as query key", () => {
    const fetchFn = vi.fn();
    const options = ordersQueryOptions(fetchFn);

    expect(options.queryKey).toEqual(queryKeys.orders.list());
    expect(options.queryKey).toEqual(["orders", "list", undefined]);
  });

  it("calls fetchFn when queryFn is invoked", async () => {
    const fetchFn = vi.fn().mockResolvedValue([]);
    const options = ordersQueryOptions(fetchFn);

    await options.queryFn!({} as never);

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("returns the resolved value from fetchFn", async () => {
    const mockOrders = [{ id: "order-1", status: "COMPLETED", total: 5000, bag_count: 2 }];
    const fetchFn = vi.fn().mockResolvedValue(mockOrders);
    const options = ordersQueryOptions(fetchFn);

    const result = await options.queryFn!({} as never);

    expect(result).toEqual(mockOrders);
  });

  it("produces different cache key than orderDetailQueryOptions", () => {
    const fetchFn = vi.fn();
    const listOptions = ordersQueryOptions(fetchFn);
    const detailOptions = orderDetailQueryOptions("order-1", vi.fn());

    expect(listOptions.queryKey).not.toEqual(detailOptions.queryKey);
  });
});

// ─── orderDetailQueryOptions ─────────────────────────────────────────────────

describe("orderDetailQueryOptions", () => {
  it("includes orderId in query key", () => {
    const fetchFn = vi.fn();
    const options = orderDetailQueryOptions("order-abc", fetchFn);

    expect(options.queryKey).toEqual(queryKeys.orders.detail("order-abc"));
    expect(options.queryKey).toEqual(["orders", "detail", "order-abc"]);
  });

  it("produces different keys for different orderIds (cache isolation)", () => {
    const fetchFn = vi.fn();
    const options1 = orderDetailQueryOptions("order-1", fetchFn);
    const options2 = orderDetailQueryOptions("order-2", fetchFn);

    expect(options1.queryKey).not.toEqual(options2.queryKey);
  });

  it("calls fetchFn with orderId when queryFn is invoked", async () => {
    const mockOrder = { id: "order-abc", status: "SHIPPED", order_bags: [] };
    const fetchFn = vi.fn().mockResolvedValue(mockOrder);
    const options = orderDetailQueryOptions("order-abc", fetchFn);

    const result = await options.queryFn!({} as never);

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith("order-abc");
    expect(result).toEqual(mockOrder);
  });

  it("handles null response (order not found / RLS blocked)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(null);
    const options = orderDetailQueryOptions("nonexistent-order", fetchFn);

    const result = await options.queryFn!({} as never);

    expect(result).toBeNull();
  });
});

// ─── createOrdersRealtimeChannel ─────────────────────────────────────────────
// Tests call the production function directly (not a replica of its logic).

describe("createOrdersRealtimeChannel", () => {
  let mockChannel: {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };
  let mockSupabase: Partial<SupabaseClient>;
  let mockQueryClient: Partial<QueryClient>;

  beforeEach(() => {
    mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    };
    mockSupabase = {
      channel: vi.fn().mockReturnValue(mockChannel),
    };
    mockQueryClient = {
      invalidateQueries: vi.fn(),
    };
  });

  it("creates channel with correct name for authenticated user", () => {
    createOrdersRealtimeChannel(
      mockSupabase as SupabaseClient,
      "user-123",
      mockQueryClient as QueryClient,
    );

    expect(mockSupabase.channel).toHaveBeenCalledWith("orders:user_user-123");
  });

  it("subscribes to orders table UPDATE with user_id filter", () => {
    createOrdersRealtimeChannel(
      mockSupabase as SupabaseClient,
      "user-123",
      mockQueryClient as QueryClient,
    );

    expect(mockChannel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "UPDATE",
        table: "orders",
        filter: "user_id=eq.user-123",
      }),
      expect.any(Function),
    );
  });

  it("subscribes to order_bags table UPDATE (no filter — no user_id column)", () => {
    createOrdersRealtimeChannel(
      mockSupabase as SupabaseClient,
      "user-123",
      mockQueryClient as QueryClient,
    );

    expect(mockChannel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "UPDATE",
        table: "order_bags",
      }),
      expect.any(Function),
    );
  });

  it("invalidates queryKeys.orders.all() when orders UPDATE fires", () => {
    createOrdersRealtimeChannel(
      mockSupabase as SupabaseClient,
      "user-123",
      mockQueryClient as QueryClient,
    );

    const ordersCallback = mockChannel.on.mock.calls[0][2] as () => void;
    ordersCallback();

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.orders.all(),
    });
  });

  it("invalidates queryKeys.orders.all() when order_bags UPDATE fires", () => {
    createOrdersRealtimeChannel(
      mockSupabase as SupabaseClient,
      "user-123",
      mockQueryClient as QueryClient,
    );

    const bagsCallback = mockChannel.on.mock.calls[1][2] as () => void;
    bagsCallback();

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.orders.all(),
    });
  });

  it("calls subscribe() on the channel", () => {
    createOrdersRealtimeChannel(
      mockSupabase as SupabaseClient,
      "user-123",
      mockQueryClient as QueryClient,
    );

    expect(mockChannel.subscribe).toHaveBeenCalledOnce();
  });

  it("returns the channel so callers can unsubscribe", () => {
    const channel = createOrdersRealtimeChannel(
      mockSupabase as SupabaseClient,
      "user-123",
      mockQueryClient as QueryClient,
    );

    // The returned channel is the mock (subscribe returns `this`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = channel as any;
    ch.unsubscribe();
    expect(mockChannel.unsubscribe).toHaveBeenCalledOnce();
  });
});
