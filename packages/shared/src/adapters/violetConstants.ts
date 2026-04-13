/**
 * Constants, cache state, and low-level utilities for the Violet adapter.
 *
 * Extracted from violetAdapter.ts to keep each module focused.
 * This file has ZERO imports from other adapter modules — it is the
 * foundation layer everything else depends on.
 */

/**
 * Maximum number of retry attempts on transient errors (HTTP 429, network failures).
 * After MAX_RETRIES, the error is returned to the caller.
 */
export const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff: 1s, 2s, 4s. */
export const BASE_DELAY_MS = 1000;

/**
 * Timeout in ms for each individual fetch request.
 *
 * Prevents hung connections from tying up server resources indefinitely.
 * 30s is generous enough for Violet's cross-merchant API calls while
 * still protecting against network black holes.
 *
 * @see M1 fix — no timeout existed before, risking indefinite hangs
 */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * In-memory cache for Demo Mode product listings.
 *
 * ## Why cache here?
 *
 * In Violet Demo Mode, `POST /catalog/offers/search` returns 0 results
 * (demo merchants are not indexed). The fallback `getProductsFromMerchants`
 * makes multiple sequential Violet API calls:
 *   1. GET /merchants (~200ms)
 *   2. GET /catalog/offers/merchants/{id} × N merchants (~500ms each)
 *
 * This chain causes ~2100ms SSR TTFB on the /products page.
 * Caching the raw offers list for 60 seconds reduces repeat requests to <10ms.
 *
 * ## What is cached
 * The raw offer objects (before country-specific transformation), keyed by nothing
 * since Demo Mode always returns the same set of merchants/offers. Transformation
 * via `transformOffer(offer, countryCode)` is re-applied per-request (cheap, O(n)).
 *
 * ## TTL choice
 * 60 seconds balances freshness with performance. Products update via webhooks
 * (OFFER_ADDED/UPDATED/REMOVED), so a 60s lag is acceptable for catalog browsing.
 * Webhooks handle eventual consistency; this cache handles SSR latency.
 *
 * @see getProductsFromMerchants — the only consumer of this cache
 */
export interface DemoOffersCache {
  rawOffers: unknown[];
  expiresAt: number;
}
export let _demoOffersCache: DemoOffersCache | null = null;
export const DEMO_CACHE_TTL_MS = 60_000;

/**
 * Cache for dynamically derived categories. Categories rarely change
 * (only when merchants add products in new categories), so a 5-minute TTL
 * balances freshness with API call reduction.
 */
export interface CategoriesCache {
  data: import("../types/index.js").CategoryItem[];
  expiresAt: number;
}
export let _categoriesCache: CategoriesCache | null = null;
export const CATEGORIES_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resets all module-level caches. Test-only utility — allows each test to start
 * with clean caches without module-level side effects from previous tests.
 *
 * @internal Exported for testing only — do not use in application code.
 */
export function _resetCategoriesCache(): void {
  _categoriesCache = null;
  _demoOffersCache = null;
}

/** Set the demo offers cache (mutable from any importer). */
export function setDemoOffersCache(cache: DemoOffersCache | null): void {
  _demoOffersCache = cache;
}

/** Set the categories cache (mutable from any importer). */
export function setCategoriesCache(cache: CategoriesCache | null): void {
  _categoriesCache = cache;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Maps HTTP status codes to structured Violet error codes.
 *
 * Error code convention: `VIOLET.<ACTION_FAILURE>`
 * - 429 → RATE_LIMITED (per-merchant, proxied from Shopify/Amazon)
 * - 401/403 → AUTH_FAILED (token expired or invalid)
 * - 404 → NOT_FOUND (offer/SKU doesn't exist)
 * - Other → API_ERROR (catch-all)
 *
 * @see https://docs.violet.io/concepts/rate-limits
 */
export function mapHttpError(status: number): string {
  switch (status) {
    case 429:
      return "VIOLET.RATE_LIMITED";
    case 401:
    case 403:
      return "VIOLET.AUTH_FAILED";
    case 404:
      return "VIOLET.NOT_FOUND";
    /**
     * 409 Conflict — duplicate submission with a different app_order_id,
     * or cart state conflict (e.g., already submitted with different data).
     *
     * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-completion/submit-cart
     */
    case 409:
      return "VIOLET.CONFLICT";
    /**
     * 412 Precondition Failed — cart not priced, missing required checkout steps,
     * or cart currency mismatch. Indicates the checkout flow was incomplete.
     *
     * @see https://docs.violet.io/api-reference/orders-and-checkout/cart-completion/submit-cart
     */
    case 412:
      return "VIOLET.PRECONDITION_FAILED";
    default:
      return "VIOLET.API_ERROR";
  }
}
