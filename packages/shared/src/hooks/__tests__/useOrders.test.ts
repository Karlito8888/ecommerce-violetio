import { describe, it, expect, vi } from "vitest";
import { ordersQueryOptions, orderDetailQueryOptions } from "../useOrders.js";
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

  it("handles null response (order not found)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(null);
    const options = orderDetailQueryOptions("nonexistent-order", fetchFn);

    const result = await options.queryFn!({} as never);

    expect(result).toBeNull();
  });
});
