/**
 * Guest Order Server Functions — TanStack Start RPC wrappers.
 *
 * ## Two lookup paths
 *
 * 1. **Token-based**: The guest has a plaintext lookup token from the order
 *    confirmation page. We hash it server-side (SHA-256) and query by hash.
 *    No auth session required.
 *
 * 2. **Email-based**: The guest verifies their email via Supabase OTP (magic link).
 *    After OTP verification, a temporary Supabase session exists. We confirm the
 *    session's email, then use service_role to query all orders for that email.
 *    The browser signs out after displaying results to clean up the session.
 *
 * ## Client bundle safety
 *
 * Handler logic lives in guestOrderHandlers.ts and is loaded via dynamic import
 * INSIDE each .handler() closure. TanStack Start removes the .handler() body from
 * the client bundle, taking the dynamic import with it — so node:crypto (used by
 * hashOrderLookupToken) never appears in the browser build.
 *
 * Static imports of server-only modules at the file's top level would be bundled
 * into the client even after the handler body is stripped.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OrderWithBagsAndItems } from "@ecommerce/shared";

// ─── Server Functions (TanStack Start RPC wrappers) ───────────────────────────

/**
 * Server Function — looks up a single guest order by plaintext lookup token.
 * Hashes the token server-side before querying (SHA-256).
 */
export const lookupOrderByTokenFn = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<OrderWithBagsAndItems | null> => {
    const { lookupOrderByTokenHandler } = await import("./guestOrderHandlers");
    return lookupOrderByTokenHandler(data.token);
  });

/**
 * Server Function — fetches all guest orders for the OTP-verified session email.
 * Must be called immediately after Supabase OTP verification while session exists.
 */
export const lookupOrdersByEmailFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<OrderWithBagsAndItems[]> => {
    const { lookupOrdersByEmailHandler } = await import("./guestOrderHandlers");
    return lookupOrdersByEmailHandler();
  },
);
