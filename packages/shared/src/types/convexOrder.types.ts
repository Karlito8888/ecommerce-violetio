/**
 * Convex order types — shared between web and mobile.
 *
 * These types mirror the shapes returned by Convex queries in
 * `convex/orders/queries.ts` (getOrders, getOrderDetail).
 * They are the **single source of truth** for order UI types —
 * both apps/web and apps/mobile import from here.
 *
 * Convex queries are reactive by default — no manual Realtime needed.
 * When data changes (via mutation or webhook), all connected clients
 * are notified automatically.
 *
 * @see convex/orders/queries.ts — backend query implementations
 * @see https://docs.convex.dev/realtime — Convex reactivity docs
 */

export interface ConvexOrderItem {
  _id: string;
  name: string;
  quantity: number;
  price: number;
  linePrice: number;
  thumbnail?: string;
}

export interface ConvexOrderRefund {
  _id: string;
  amount: number;
  reason?: string;
  status: string;
}

export interface ConvexOrderBag {
  _id: string;
  _creationTime: number;
  merchantName: string;
  status: string;
  total: number;
  shippingMethod?: string;
  trackingUrl?: string;
  trackingNumber?: string;
  carrier?: string;
  items: ConvexOrderItem[];
  refunds: ConvexOrderRefund[];
}

export interface ConvexOrder {
  _id: string;
  _creationTime: number;
  violetOrderId: string;
  userId?: string;
  email: string;
  status: string;
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  currency: string;
  bags: ConvexOrderBag[];
}
