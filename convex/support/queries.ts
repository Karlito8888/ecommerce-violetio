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
  handler: async (ctx, { status }) => {
    await assertAdmin(ctx);

    if (status) {
      return await ctx.db
        .query("supportInquiries")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .collect();
    }

    return await ctx.db.query("supportInquiries").order("desc").collect();
  },
});

/**
 * Fetch a single support inquiry by ID. Admin-only.
 */
export const getSupportInquiry = query({
  args: { inquiryId: v.id("supportInquiries") },
  handler: async (ctx, { inquiryId }) => {
    await assertAdmin(ctx);
    return await ctx.db.get(inquiryId);
  },
});

/**
 * Fetch linked order info by Violet order ID.
 * Used to display order context alongside a support inquiry. Admin-only.
 */
export const getLinkedOrder = query({
  args: { violetOrderId: v.string() },
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
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const inquiries = await ctx.db
      .query("supportInquiries")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();

    return inquiries.filter((i) => i._creationTime >= oneHourAgo).length;
  },
});
