/**
 * Shared constants for Deno Edge Functions.
 *
 * SYNC: These values MUST match packages/shared/src/adapters/violetConstants.ts.
 * If you change a value here, change it there too (and vice versa).
 *
 * Why a separate file? Edge Functions run in Deno and cannot import from
 * @ecommerce/shared. Centralizing these constants in one place makes the
 * sync contract explicit and grep-friendly.
 */

/** Maximum number of retry attempts on transient errors (HTTP 429, network failures). */
export const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff (1s → 2s → 4s). */
export const BASE_DELAY_MS = 1000;

/** Per-request timeout in milliseconds. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Default Violet API base URL (sandbox). Sync with packages/shared/src/utils/constants.ts. */
export const DEFAULT_VIOLET_API_BASE = "https://sandbox-api.violet.io/v1";

/**
 * Sleep for `ms` milliseconds.
 * SYNC: Same as packages/shared/src/adapters/violetConstants.ts delay().
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
