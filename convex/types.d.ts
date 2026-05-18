// convex/types.d.ts
//
// Type declarations for the Convex runtime environment.
//
// Convex injects `process.env` at bundle time with the values configured
// via `npx convex env set`. This declaration makes TypeScript aware of
// the available keys so `process.env.MY_KEY` doesn't produce TS2591.
//
// Long-term: migrate to `env` from `_generated/server` (generated from
// convex.config.ts `defineApp({ env: {...} })`). This gives per-key
// typing (string vs optional) and deploy-time validation.
//
// Doc: https://docs.convex.dev/production/environment-variables

declare namespace NodeJS {
  interface ProcessEnv {
    // ─── Convex Auth ───────────────────────────────────────────
    AUTH_RESEND_KEY?: string;
    EMAIL_FROM_ADDRESS?: string;
    SITE_URL?: string;

    // ─── Violet.io API ─────────────────────────────────────────
    VIOLET_APP_ID?: string;
    VIOLET_APP_SECRET?: string;
    VIOLET_USERNAME?: string;
    VIOLET_PASSWORD?: string;
    VIOLET_API_BASE?: string;

    // ─── Stripe ────────────────────────────────────────────────
    STRIPE_SECRET_KEY?: string;

    // ─── Admin ─────────────────────────────────────────────────
    ADMIN_ALERT_EMAIL?: string;
  }
}

// Minimal process declaration — Convex provides this at runtime
declare const process: {
  env: NodeJS.ProcessEnv;
};
