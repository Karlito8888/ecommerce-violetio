/**
 * HTTP fetch with retry, timeout, auth, and exponential backoff for Violet API calls
 * in Supabase Edge Functions (Deno runtime).
 *
 * ## Design: self-contained auth + retry
 *
 * This module combines two concerns that were previously separate:
 * 1. Auth header injection (was: manual `getVioletHeaders()` + `violetHeaders` in every EF)
 * 2. Retry/backoff on 429 + network errors
 *
 * Edge Functions now call `violetFetch(url, init)` instead of:
 * ```ts
 * // OLD (boilerplate in every Edge Function):
 * const authResult = await getVioletHeaders();
 * if (authResult.error) return errorResponse(...);
 * const violetHeaders = { ...authResult.data, "Content-Type": "application/json" };
 * const res = await fetch(url, { headers: violetHeaders, ...init });
 * ```
 *
 * ## Retry strategy (sync with violetFetch.ts / violetConstants.ts)
 *
 * Retries on:
 * - HTTP 429 (rate limited) — per-merchant, proxied from Shopify etc.
 * - Network errors (fetch rejection) — transient connectivity issues
 *
 * Does NOT retry on:
 * - HTTP 4xx (except 429) — client errors won't self-resolve
 * - HTTP 5xx — server errors require Violet-side fixes
 *
 * Delays: 1s → 2s → 4s (exponential backoff with base 1000ms)
 *
 * SYNC: Constants must match packages/shared/src/adapters/violetConstants.ts.
 * SYNC: Auth logic lives in ./violetAuth.ts — duplicated from packages/shared/src/clients/violetAuth.ts.
 *
 * @see https://docs.violet.io/concepts/rate-limits
 * @see https://docs.violet.io/concepts/overview/making-authenticated-requests
 */

import { getVioletHeaders } from "./violetAuth.ts";
import { MAX_RETRIES, BASE_DELAY_MS, REQUEST_TIMEOUT_MS, delay } from "./constants.ts";

// ── Constants imported from ./constants.ts (sync with violetConstants.ts) ─────

// ── Error type ──────────────────────────────────────────────────────────────

/** Structured error returned when violetFetch fails (auth or network). */
export interface VioletFetchError {
  code: string;
  message: string;
}

// ── Core ────────────────────────────────────────────────────────────────────

/**
 * Performs an authenticated HTTP request to the Violet API with:
 * - **Auth headers** injected automatically via `getVioletHeaders()`
 * - **Content-Type** set to `application/json` only when a body is present
 *   (POST/PUT/PATCH). GET requests don't include Content-Type — it has no
 *   meaning without a body and some proxies may reject it.
 * - **Retry on 429** and network errors with exponential backoff (1s → 2s → 4s)
 * - **Request timeout** (30s) via AbortController
 *
 * Returns a standard `Response` object, so existing `if (!res.ok)` patterns
 * continue to work without changes.
 *
 * @param url  - Full Violet API URL (e.g. `${VIOLET_API_BASE}/checkout/cart`)
 * @param init - Standard fetch RequestInit. Do NOT include `headers` — they are
 *               injected automatically. Just provide `method`, `body`, etc.
 * @returns Standard Response object
 * @throws {VioletFetchError} on auth failure or after all retries exhausted
 *
 * @example
 * // Simple GET
 * const res = await violetFetch(`${VIOLET_API_BASE}/merchants?page=1&size=50`);
 * if (!res.ok) { ... }
 * const data = await res.json();
 *
 * @example
 * // POST with body
 * const res = await violetFetch(`${VIOLET_API_BASE}/checkout/cart`, {
 *   method: "POST",
 *   body: JSON.stringify({ channel_id: appId, wallet_based_checkout: true }),
 * });
 */
export async function violetFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  // ── Auth ────────────────────────────────────────────────────────────
  const authResult = await getVioletHeaders();
  if (authResult.error) {
    const err: VioletFetchError = {
      code: authResult.error.code,
      message: authResult.error.message,
    };
    throw err;
  }

  /**
   * Only set Content-Type for requests with a body (POST, PUT, PATCH).
   * GET requests should not include Content-Type as they have no body,
   * and some proxies/CDNs may reject or mishandle it.
   */
  const headers: Record<string, string> = {
    ...authResult.data,
    ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
  };

  // ── Retry loop ──────────────────────────────────────────────────────
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(url, { ...init, headers, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      // HTTP 429: rate limited — retry with backoff if attempts remain
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await res.text().catch(() => {}); // free the connection
        await delay(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }

      return res;
    } catch (err) {
      // Network error or timeout — retry with backoff if attempts remain
      if (attempt < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }

  throw new Error("violetFetch: exhausted all retries on HTTP 429");
}

/**
 * Raw fetch with retry and timeout — NO auth injection.
 *
 * Use this when you need to provide your own headers (e.g., health-check
 * which does its own login to test connectivity, or non-Violet APIs).
 *
 * Same retry/timeout logic as violetFetch, but headers come from `init`.
 *
 * @example
 * // health-check: custom login + custom headers
 * const loginRes = await fetchWithRetryRaw(`${apiBase}/v1/login`, {
 *   method: "POST",
 *   headers: { "X-Violet-App-Id": appId, ... },
 *   body: JSON.stringify({ username, password }),
 * });
 */
export async function fetchWithRetryRaw(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (res.status === 429 && attempt < MAX_RETRIES) {
        await res.text().catch(() => {});
        await delay(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }

      return res;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }

  throw new Error("fetchWithRetryRaw: exhausted all retries on HTTP 429");
}
