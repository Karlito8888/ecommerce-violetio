// convex/support/mutations.ts
//
// Convex mutations for support inquiries.
// Replaces packages/shared/src/clients/support.ts + admin-support.ts (Supabase).
//
// Doc: https://docs.convex.dev/database/writing-data

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { assertAdmin } from "../lib/admin";

/**
 * Insert a new support inquiry from the public contact form.
 * No auth required — this is a public endpoint.
 */
export const insertSupportInquiry = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    subject: v.string(),
    message: v.string(),
    orderId: v.optional(v.string()),
  },
  handler: async (ctx, { name, email, subject, message, orderId }) => {
    const id = await ctx.db.insert("supportInquiries", {
      name,
      email,
      subject,
      message,
      orderId,
      status: "new",
    });
    return id;
  },
});

/**
 * Update inquiry status. Admin-only.
 */
export const updateInquiryStatus = mutation({
  args: {
    inquiryId: v.id("supportInquiries"),
    status: v.string(), // "new" | "in-progress" | "resolved"
  },
  handler: async (ctx, { inquiryId, status }) => {
    await assertAdmin(ctx);
    await ctx.db.patch("supportInquiries", inquiryId, { status });
  },
});

/**
 * Add/replace internal notes on an inquiry. Admin-only.
 */
export const updateInternalNotes = mutation({
  args: {
    inquiryId: v.id("supportInquiries"),
    notes: v.string(),
  },
  handler: async (ctx, { inquiryId, notes }) => {
    await assertAdmin(ctx);
    await ctx.db.patch("supportInquiries", inquiryId, { internalNotes: notes });
  },
});
