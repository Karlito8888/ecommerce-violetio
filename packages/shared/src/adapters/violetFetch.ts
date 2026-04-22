/**
 * HTTP fetch with retry, auth, and timeout for the Violet API.
 *
 * Extracted from VioletAdapter so it can be tested and reused independently.
 */

import type { VioletTokenManager } from "../clients/violetAuth.js";
import type { VioletAuthHeaders } from "../types/index.js";
import {
  MAX_RETRIES,
  BASE_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  delay,
  mapHttpError,
} from "./violetConstants.js";

export type FetchResult =
  | { data: unknown; error: null }
  | { data: null; error: { code: string; message: string } };

/**
 * Performs an HTTP request to the Violet API with:
 * - Auth headers from VioletTokenManager
 * - Request timeout (30s) via AbortController
 * - Token refresh + retry on HTTP 401 (expired/revoked token)
 * - Exponential backoff retry on HTTP 429 and network errors
 * - Structured error mapping for all failure modes
 *
 * ## Retry strategy
 *
 * Retries on:
 * - HTTP 401 (auth failed) — invalidates cached token, re-authenticates, retries once
 * - HTTP 429 (rate limited) — per-merchant, proxied from Shopify/Amazon
 * - Network errors (fetch rejection) — transient connectivity issues
 *
 * Does NOT retry on:
 * - HTTP 4xx (except 401 and 429) — client errors won't self-resolve
 * - HTTP 5xx — server errors require Violet-side fixes
 * - JSON parse errors on successful responses — retrying won't change the body
 *
 * Delays: 1s → 2s → 4s (exponential backoff with base 1000ms)
 *
 * @see https://docs.violet.io/concepts/rate-limits
 * @see https://docs.violet.io/concepts/overview/token-refresh-management
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  tokenManager: VioletTokenManager,
): Promise<FetchResult> {
  let headersResult = await tokenManager.getAuthHeaders();
  if (headersResult.error) return { data: null, error: headersResult.error };

  /**
   * Only set Content-Type for requests with a body (POST, PUT, PATCH).
   * GET requests should not include Content-Type as they have no body,
   * and some proxies/CDNs may reject or mishandle it.
   *
   * @see M2 fix — previously sent Content-Type on all requests including GET
   */
  const buildHeaders = (authHeaders: VioletAuthHeaders): Record<string, string> => ({
    ...authHeaders,
    ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
  });

  let headers = buildHeaders(headersResult.data);
  let refreshedOn401 = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      /**
       * AbortController provides a per-request timeout to prevent indefinite hangs.
       * Each retry attempt gets a fresh timeout.
       *
       * @see M1 fix — no timeout existed before, risking resource exhaustion
       */
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(url, { ...init, headers, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (res.ok) {
        /**
         * Parse JSON separately from the fetch try/catch.
         * If the response was received successfully (2xx) but the body
         * is not valid JSON, we should NOT retry — the server won't
         * send different content for the same request.
         *
         * @see L1 fix — previously JSON parse errors triggered retries
         */
        try {
          const data: unknown = await res.json();
          return { data, error: null };
        } catch {
          return {
            data: null,
            error: {
              code: "VIOLET.API_ERROR",
              message: `Violet returned status ${res.status} but response body is not valid JSON`,
            },
          };
        }
      }

      // HTTP 401: token expired or revoked — refresh and retry once
      // @see https://docs.violet.io/concepts/overview/token-refresh-management
      if (res.status === 401 && !refreshedOn401) {
        // Consume the body to free the connection
        await res.text().catch(() => {});
        tokenManager.invalidateToken();
        headersResult = await tokenManager.getAuthHeaders();
        if (headersResult.error) {
          return { data: null, error: headersResult.error };
        }
        headers = buildHeaders(headersResult.data);
        refreshedOn401 = true;
        // Don't increment attempt — this is a one-time auth retry, not a backoff
        continue;
      }

      // HTTP 429: rate limited — retry with backoff if attempts remain
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }

      // Non-retryable HTTP error (or 429/401 with no retries left)
      const errorBody = await res.text().catch(() => "");
      return {
        data: null,
        error: {
          code: mapHttpError(res.status),
          message: `Violet API error (${res.status}): ${errorBody}`.slice(0, 500),
        },
      };
    } catch (err) {
      // Network error or timeout — retry with backoff if attempts remain
      if (attempt < MAX_RETRIES) {
        await delay(BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      return {
        data: null,
        error: {
          code: "VIOLET.NETWORK_ERROR",
          message: err instanceof Error ? err.message : "Unknown network error",
        },
      };
    }
  }

  // Exhausted all retries on 429
  return {
    data: null,
    error: { code: "VIOLET.RATE_LIMITED", message: "Max retries exceeded" },
  };
}
