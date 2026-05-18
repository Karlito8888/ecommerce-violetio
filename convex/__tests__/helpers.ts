/**
 * Shared test helpers for Convex backend tests.
 *
 * Centralizes fixtures, seed functions, and mock patterns used across
 * all convex/__tests__/*.test.ts files — DRY.
 *
 * The `modules` object is built via `import.meta.glob` which is resolved
 * by Vitest/Vite at test time. It maps Convex function file paths to lazy
 * importers that convex-test uses to resolve `api.*` references.
 *
 * @module convex/__tests__/helpers
 */
import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import schema from "../schema";

// Collect all Convex function modules for convex-test's module cache.
// The glob pattern must cover all .ts files in convex/ (excluding __tests__).
const modules = import.meta.glob("../**/*.*s", {
  eager: false,
});

/**
 * Creates a fresh convex-test instance with the app schema and all function modules.
 * Each call returns an isolated in-memory database — tests don't share state.
 */
function createTest() {
  return convexTest(schema, modules);
}

export { createTest as convexTest };
export { schema };
export { api, internal } from "../_generated/api";

// ─── Identity helpers ──────────────────────────────────────────────────

/** Standard test user identity. */
export const TEST_USER = {
  subject: "user-abc123",
  name: "Test User",
  email: "test@maisonemile.com",
  emailVerified: true,
  tokenIdentifier: "test:user-abc123",
  issuer: "https://maisonemile.com",
} as const;

/** Admin user identity for admin-only function tests. */
export const ADMIN_USER = {
  subject: "admin-xyz789",
  name: "Admin User",
  email: "admin@maisonemile.com",
  emailVerified: true,
  tokenIdentifier: "test:admin-xyz789",
  issuer: "https://maisonemile.com",
} as const;

// ─── Seed helpers ──────────────────────────────────────────────────────

/**
 * Seeds a user profile in the database.
 * Returns the profile document ID.
 */
export async function seedUserProfile(
  t: TestConvex,
  overrides: {
    userId?: string;
    displayName?: string;
    isAdmin?: boolean;
    biometricEnabled?: boolean;
  } = {},
) {
  const userId = overrides.userId ?? TEST_USER.subject;
  return t.run(async (ctx) => {
    return ctx.db.insert("userProfiles", {
      userId,
      displayName: overrides.displayName ?? "Test User",
      preferences: {},
      biometricEnabled: overrides.biometricEnabled ?? false,
      isAdmin: overrides.isAdmin ?? false,
    });
  });
}

/**
 * Seeds a complete order with bags and items.
 * Returns the order, bag, and item document IDs.
 */
export async function seedOrderWithBags(
  t: TestConvex,
  orderOverrides: {
    userId?: string;
    status?: string;
    email?: string;
    violetOrderId?: string;
    orderLookupTokenHash?: string;
  } = {},
  bagOverrides: {
    status?: string;
    merchantName?: string;
  } = {},
) {
  return t.run(async (ctx) => {
    const orderId = await ctx.db.insert("orders", {
      violetOrderId: orderOverrides.violetOrderId ?? "10001",
      userId: orderOverrides.userId ?? undefined,
      email: orderOverrides.email ?? "buyer@example.com",
      status: orderOverrides.status ?? "COMPLETED",
      subtotal: 5000,
      shippingTotal: 500,
      taxTotal: 500,
      total: 6000,
      currency: "USD",
      orderLookupTokenHash: orderOverrides.orderLookupTokenHash,
      emailSent: false,
    });

    const bagId = await ctx.db.insert("orderBags", {
      orderId,
      violetBagId: "20001",
      merchantName: bagOverrides.merchantName ?? "Test Merchant",
      status: bagOverrides.status ?? "COMPLETED",
      financialStatus: "PAID",
      subtotal: 5000,
      shippingTotal: 500,
      taxTotal: 500,
      total: 6000,
    });

    const itemId = await ctx.db.insert("orderItems", {
      orderBagId: bagId,
      skuId: "sku-001",
      name: "Test Product",
      quantity: 1,
      price: 5000,
      linePrice: 5000,
    });

    return { orderId, bagId, itemId };
  });
}

/**
 * Seeds a bare order (no bags/items). Returns the document ID.
 */
export async function seedOrder(
  t: TestConvex,
  overrides: {
    userId?: string;
    status?: string;
    email?: string;
    violetOrderId?: string;
    orderLookupTokenHash?: string;
  } = {},
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("orders", {
      violetOrderId: overrides.violetOrderId ?? "10001",
      userId: overrides.userId ?? undefined,
      email: overrides.email ?? "buyer@example.com",
      status: overrides.status ?? "COMPLETED",
      subtotal: 5000,
      shippingTotal: 500,
      taxTotal: 500,
      total: 6000,
      currency: "USD",
      orderLookupTokenHash: overrides.orderLookupTokenHash,
      emailSent: false,
    });
  });
}

/**
 * Seeds a support inquiry. Returns the document ID.
 */
export async function seedSupportInquiry(
  t: TestConvex,
  overrides: {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
    status?: string;
    orderId?: string;
  } = {},
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("supportInquiries", {
      name: overrides.name ?? "Jane Doe",
      email: overrides.email ?? "jane@example.com",
      subject: overrides.subject ?? "Order Issue",
      message: overrides.message ?? "My order is missing an item.",
      status: overrides.status ?? "new",
      orderId: overrides.orderId,
    });
  });
}

/**
 * Seeds a wishlist with items for a user. Returns wishlist and item IDs.
 */
export async function seedWishlist(t: TestConvex, userId: string, productIds: string[] = []) {
  return t.run(async (ctx) => {
    const wishlistId = await ctx.db.insert("wishlists", { userId });

    const itemIds = [];
    for (const productId of productIds) {
      const itemId = await ctx.db.insert("wishlistItems", {
        wishlistId,
        productId,
      });
      itemIds.push(itemId);
    }

    return { wishlistId, itemIds };
  });
}

/**
 * Seeds a tracking event. Returns the document ID.
 */
export async function seedTrackingEvent(
  t: TestConvex,
  overrides: {
    userId?: string;
    eventType?: string;
    payload?: Record<string, unknown>;
  } = {},
) {
  return t.run(async (ctx) => {
    return ctx.db.insert("userEvents", {
      userId: overrides.userId ?? TEST_USER.subject,
      eventType: overrides.eventType ?? "product_view",
      payload: overrides.payload,
    });
  });
}
