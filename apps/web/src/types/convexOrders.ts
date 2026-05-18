// apps/web/src/types/convexOrders.ts
//
// Shared Convex order types used by orders list and detail pages.
// Extracted to avoid duplication between index.tsx and $orderId.tsx.

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
