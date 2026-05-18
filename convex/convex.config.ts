// convex/convex.config.ts
//
// Convex app configuration with typed environment variables.
// Declaring env vars here gives us type-safe access via the generated
// `env` object imported from `_generated/server`, instead of untyped
// `process.env`.
//
// Doc: https://docs.convex.dev/production/environment-variables#declaring
//
// Usage in functions:
//   import { query, env } from "./_generated/server";
//   const key = env.AUTH_RESEND_KEY;  // typed as string
//
// After modifying this file, run `npx convex dev` to regenerate types.

import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    // ─── Convex Auth ───────────────────────────────────────────
    AUTH_RESEND_KEY: v.string(),
    EMAIL_FROM_ADDRESS: v.string(),
    SITE_URL: v.optional(v.string()),

    // ─── Violet.io API ─────────────────────────────────────────
    VIOLET_APP_ID: v.string(),
    VIOLET_APP_SECRET: v.string(),
    VIOLET_USERNAME: v.string(),
    VIOLET_PASSWORD: v.string(),
    VIOLET_API_BASE: v.optional(v.string()),

    // ─── Stripe ────────────────────────────────────────────────
    STRIPE_SECRET_KEY: v.optional(v.string()),

    // ─── Admin ─────────────────────────────────────────────────
    ADMIN_ALERT_EMAIL: v.optional(v.string()),
  },
});

export default app;
