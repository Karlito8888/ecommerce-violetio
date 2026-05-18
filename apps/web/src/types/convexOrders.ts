// apps/web/src/types/convexOrders.ts
//
// Re-export from shared package — single source of truth for
// Convex order types used by both web and mobile.
//
// Convex queries are reactive by default. No manual Realtime needed.

export type {
  ConvexOrder,
  ConvexOrderBag,
  ConvexOrderItem,
  ConvexOrderRefund,
} from "@ecommerce/shared";
