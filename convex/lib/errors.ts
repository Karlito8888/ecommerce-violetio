// convex/lib/errors.ts
//
// Structured error logging for Convex.
// Provides a reusable mutation for logging errors to the errorLogs table.
//
// Doc: https://docs.convex.dev/database/writing-data

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Log an error to the errorLogs table.
 * Internal mutation — only callable from other Convex functions (not from client).
 */
export const logError = internalMutation({
  args: {
    source: v.string(), // "web" | "mobile" | "convex"
    errorType: v.string(),
    message: v.string(),
    stackTrace: v.optional(v.string()),
    context: v.optional(v.any()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("errorLogs", args);
  },
});
