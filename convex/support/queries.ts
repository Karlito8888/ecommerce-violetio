// convex/support/queries.ts
//
// Convex queries for support inquiries (admin-facing).
// Replaces packages/shared/src/clients/admin-support.ts (Supabase).
//
// All admin queries call assertAdmin() for access control (replaces RLS).
//
// Doc: https://docs.convex.dev/database/reading-data

import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertAdmin } from "../lib/admin";

/**
 * Fetch support inquiries with optional status filter, ordered newest first.
 * Admin-only.
 */
export const getSupportInquiries = query({
  args: {
    status: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      _id: v.id("supportInquiries"),
      _creationTime: v.number(),
      name: v.string(),
      email: v.string(),
      subject: v.string(),
      message: v.string(),
      orderId: v.optional(v.string()),
      status: v.string(),
      internalNotes: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { status }) => {
    await assertAdmin(ctx);

    if (status) {
      return await ctx.db
        .query("supportInquiries")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .collect();
    }

    return await ctx.db.query("supportInquiries").order("desc").take(500);
  },
});

/**
 * Fetch a single support inquiry by ID. Admin-only.
 */
export const getSupportInquiry = query({
  args: { inquiryId: v.id("supportInquiries") },
  returns: v.union(
    v.object({
      _id: v.id("supportInquiries"),
      _creationTime: v.number(),
      name: v.string(),
      email: v.string(),
      subject: v.string(),
      message: v.string(),
      orderId: v.optional(v.string()),
      status: v.string(),
      internalNotes: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { inquiryId }) => {
    await assertAdmin(ctx);
    return await ctx.db.get("supportInquiries", inquiryId);
  },
});

/**
 * Fetch linked order info by Violet order ID.
 * Used to display order context alongside a support inquiry. Admin-only.
 */
export const getLinkedOrder = query({
  args: { violetOrderId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("orders"),
      _creationTime: v.number(),
      violetOrderId: v.string(),
      userId: v.optional(v.string()),
      sessionId: v.optional(v.string()),
      email: v.string(),
      status: v.string(),
      subtotal: v.number(),
      shippingTotal: v.number(),
      taxTotal: v.number(),
      total: v.number(),
      currency: v.string(),
      orderLookupTokenHash: v.optional(v.string()),
      emailSent: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, { violetOrderId }) => {
    await assertAdmin(ctx);
    return await ctx.db
      .query("orders")
      .withIndex("by_violetOrderId", (q) => q.eq("violetOrderId", violetOrderId))
      .first();
  },
});

/**
 * Count recent inquiries from a given email (rate limiting).
 * Returns the count of inquiries from the last hour.
 */
export const countRecentInquiries = query({
  args: { email: v.string(), now: v.number() },
  returns: v.number(),
  handler: async (ctx, { email, now }) => {
    const oneHourAgo = now - 60 * 60 * 1000;
    // Use index range on by_email ["email", _creationTime] — avoids loading all inquiries
    // Doc: https://docs.convex.dev/database/reading-data/indexes
    const inquiries = await ctx.db
      .query("supportInquiries")
      .withIndex("by_email", (q) => q.eq("email", email).gte("_creationTime", oneHourAgo))
      .collect();

    return inquiries.length;
  },
});
