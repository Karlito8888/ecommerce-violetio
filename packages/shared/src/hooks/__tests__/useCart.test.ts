import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { cartDetailQueryOptions, getCartItemCount } from "../useCart.js";
import { queryKeys } from "../../utils/constants.js";
import type { ApiResponse, Cart } from "../../types/index.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeCart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "supabase-uuid-1",
    violetCartId: "12345",
    userId: null,
    sessionId: "anon-session-1",
    bags: [
      {
        id: "bag-1",
        merchantId: "m-1",
        merchantName: "Test Merchant",
        items: [
          {
            id: "item-1",
            skuId: "sku-1",
            productId: "",
            quantity: 2,
            unitPrice: 1999,
            type: "PHYSICAL",
          },
          {
            id: "item-2",
            skuId: "sku-2",
            productId: "",
            quantity: 1,
            unitPrice: 4999,
            type: "PHYSICAL",
          },
        ],
        subtotal: 8997,
        tax: 0,
        shippingTotal: 0,
        discountTotal: 0,
        discounts: [],
        errors: [],
        isDigital: false,
        merchantCountryCode: null,
      },
    ],
    total: 8997,
    currency: "USD",
    status: "active",
    allBagsDigital: false,
    ...overrides,
  };
}

function makeCartResponse(cart: Cart): ApiResponse<Cart> {
  return { data: cart, error: null };
}

// ─── cartDetailQueryOptions ───────────────────────────────────────────────────

describe("cartDetailQueryOptions", () => {
  it("uses queryKeys.cart.detail() as query key", () => {
    const fetchFn = vi.fn();
    const options = cartDetailQueryOptions("12345", fetchFn);

    expect(options.queryKey).toEqual(queryKeys.cart.detail("12345"));
    expect(options.queryKey).toEqual(["cart", "detail", "12345"]);
  });

  it("sets staleTime to 0 (always fresh — per architecture.md#Caching)", () => {
    const fetchFn = vi.fn();
    const options = cartDetailQueryOptions("12345", fetchFn);

    expect(options.staleTime).toBe(0);
  });

  it("is disabled when violetCartId is empty string", () => {
    const fetchFn = vi.fn();
    const options = cartDetailQueryOptions("", fetchFn);

    expect(options.enabled).toBe(false);
  });

  it("is enabled when violetCartId is provided", () => {
    const fetchFn = vi.fn();
    const options = cartDetailQueryOptions("12345", fetchFn);

    expect(options.enabled).toBe(true);
  });

  it("calls fetchFn with violetCartId as queryFn", async () => {
    const cart = makeCart();
    const fetchFn = vi.fn().mockResolvedValue(makeCartResponse(cart));
    const options = cartDetailQueryOptions("12345", fetchFn);

    await options.queryFn!({} as never);

    expect(fetchFn).toHaveBeenCalledWith("12345");
  });

  it("produces isolated cache entries for different cart IDs", () => {
    const fetchFn = vi.fn();
    const options1 = cartDetailQueryOptions("111", fetchFn);
    const options2 = cartDetailQueryOptions("222", fetchFn);

    expect(options1.queryKey).not.toEqual(options2.queryKey);
  });
});

// ─── getCartItemCount ─────────────────────────────────────────────────────────

describe("getCartItemCount", () => {
  it("returns 0 for null cart", () => {
    expect(getCartItemCount(null)).toBe(0);
  });

  it("returns 0 for undefined cart", () => {
    expect(getCartItemCount(undefined)).toBe(0);
  });

  it("returns 0 for cart with empty bags", () => {
    const cart = makeCart({ bags: [] });
    expect(getCartItemCount(cart)).toBe(0);
  });

  it("sums quantities across all items in all bags", () => {
    // Fixture cart has qty=2 + qty=1 = 3
    expect(getCartItemCount(makeCart())).toBe(3);
  });

  it("sums correctly across multiple bags", () => {
    const cart = makeCart({
      bags: [
        {
          id: "bag-1",
          merchantId: "m-1",
          merchantName: "M1",
          items: [
            {
              id: "i1",
              skuId: "sku-1",
              productId: "",
              quantity: 3,
              unitPrice: 1000,
              type: "PHYSICAL",
            },
          ],
          subtotal: 3000,
          tax: 0,
          shippingTotal: 0,
          discountTotal: 0,
          discounts: [],
          errors: [],
          isDigital: false,
          merchantCountryCode: null,
        },
        {
          id: "bag-2",
          merchantId: "m-2",
          merchantName: "M2",
          items: [
            {
              id: "i2",
              skuId: "sku-2",
              productId: "",
              quantity: 2,
              unitPrice: 2000,
              type: "PHYSICAL",
            },
            {
              id: "i3",
              skuId: "sku-3",
              productId: "",
              quantity: 1,
              unitPrice: 500,
              type: "PHYSICAL",
            },
          ],
          subtotal: 4500,
          tax: 0,
          shippingTotal: 0,
          discountTotal: 0,
          discounts: [],
          errors: [],
          isDigital: false,
          merchantCountryCode: null,
        },
      ],
    });

    expect(getCartItemCount(cart)).toBe(6); // 3 + 2 + 1
  });
});

// ─── Optimistic update cache behavior ────────────────────────────────────────

describe("optimistic update cache behavior", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it("setQueryData correctly stores cart response in cache", () => {
    const cart = makeCart();
    const queryKey = queryKeys.cart.detail("12345");
    const response = makeCartResponse(cart);

    queryClient.setQueryData(queryKey, response);

    const cached = queryClient.getQueryData<ApiResponse<Cart>>(queryKey);
    expect(cached?.data?.violetCartId).toBe("12345");
    expect(cached?.data?.bags[0].items).toHaveLength(2);
  });

  it("getQueryData returns undefined for unknown cart ID (no pollution between carts)", () => {
    const cart = makeCart();
    queryClient.setQueryData(queryKeys.cart.detail("12345"), makeCartResponse(cart));

    const otherCart = queryClient.getQueryData(queryKeys.cart.detail("99999"));
    expect(otherCart).toBeUndefined();
  });

  it("optimistic quantity update pattern modifies correct item", () => {
    const cart = makeCart();
    const queryKey = queryKeys.cart.detail("12345");
    queryClient.setQueryData(queryKey, makeCartResponse(cart));

    // Simulate optimistic update
    const previous = queryClient.getQueryData<ApiResponse<Cart>>(queryKey);
    const optimistic: ApiResponse<Cart> = {
      data: {
        ...previous!.data!,
        bags: previous!.data!.bags.map((bag) => ({
          ...bag,
          items: bag.items.map((item) =>
            item.skuId === "sku-1" ? { ...item, quantity: 5 } : item,
          ),
        })),
      },
      error: null,
    };
    queryClient.setQueryData(queryKey, optimistic);

    const updated = queryClient.getQueryData<ApiResponse<Cart>>(queryKey);
    const updatedItem = updated?.data?.bags[0].items.find((i) => i.skuId === "sku-1");
    expect(updatedItem?.quantity).toBe(5);
    // Other item unchanged
    const otherItem = updated?.data?.bags[0].items.find((i) => i.skuId === "sku-2");
    expect(otherItem?.quantity).toBe(1);
  });

  it("rollback restores previous state on error", () => {
    const cart = makeCart();
    const queryKey = queryKeys.cart.detail("12345");
    queryClient.setQueryData(queryKey, makeCartResponse(cart));

    const snapshot = queryClient.getQueryData<ApiResponse<Cart>>(queryKey);

    // Simulate optimistic update
    queryClient.setQueryData(queryKey, {
      data: { ...cart, total: 99999 },
      error: null,
    });

    // Rollback on error
    queryClient.setQueryData(queryKey, snapshot);

    const restored = queryClient.getQueryData<ApiResponse<Cart>>(queryKey);
    expect(restored?.data?.total).toBe(8997); // Original value
  });

  it("optimistic remove filters item from bags", () => {
    const cart = makeCart();
    const queryKey = queryKeys.cart.detail("12345");
    queryClient.setQueryData(queryKey, makeCartResponse(cart));

    const previous = queryClient.getQueryData<ApiResponse<Cart>>(queryKey);
    const withRemoved: ApiResponse<Cart> = {
      data: {
        ...previous!.data!,
        bags: previous!
          .data!.bags.map((bag) => ({
            ...bag,
            items: bag.items.filter((item) => item.skuId !== "sku-1"),
          }))
          .filter((bag) => bag.items.length > 0),
      },
      error: null,
    };
    queryClient.setQueryData(queryKey, withRemoved);

    const updated = queryClient.getQueryData<ApiResponse<Cart>>(queryKey);
    expect(updated?.data?.bags[0].items).toHaveLength(1);
    expect(updated?.data?.bags[0].items[0].skuId).toBe("sku-2");
  });
});
