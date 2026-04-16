/**
 * Violet Currency Exchange Rates API integration.
 *
 * Fetches live exchange rates from `GET /catalog/currencies/latest`.
 * Rates are cached in memory for up to 12 hours (Violet caches for max 24h).
 *
 * ## Usage
 * - Server-side only (Edge Functions, Server Functions)
 * - Rates are stored in a module-level cache and shared across calls
 * - Falls back to hardcodED rates in `currency.ts` if the API is unavailable
 *
 * ## Violet API details
 * - Endpoint: `GET /catalog/currencies/latest`
 * - Params: `base_currency` (default: "USD"), `symbols` (comma-separated, optional)
 * - Response: `{ success: bool, timestamp: int64, base: string, date: string, rates: Record<string, number> }`
 * - Cache: Violet caches rates for up to 24 hours
 *
 * @see https://docs.violet.io/api-reference/catalog/currencies/currency-exchange-rates
 */

import { z } from "zod";
import { fetchWithRetry } from "./violetFetch.js";
import type { CatalogContext } from "./violetCatalog.js";

// ─── Zod Schema ─────────────────────────────────────────────────────

/**
 * Zod schema for the Violet Exchange Rates response.
 *
 * @see https://docs.violet.io/api-reference/catalog/currencies/currency-exchange-rates
 *   GET /catalog/currencies/latest → Latest schema
 */
export const violetExchangeRatesResponseSchema = z.object({
  /** Whether the request was successful. */
  success: z.boolean(),
  /** Unix timestamp of the rates. */
  timestamp: z.number(),
  /** Base currency for the rates (e.g., "USD"). */
  base: z.string(),
  /** Date string (e.g., "2026-04-16"). */
  date: z.string(),
  /** Map of currency code → exchange rate relative to base. */
  rates: z.record(z.string(), z.number()),
});

export type VioletExchangeRatesResponse = z.infer<typeof violetExchangeRatesResponseSchema>;

// ─── In-memory cache ────────────────────────────────────────────────

/**
 * Cache TTL: 12 hours.
 *
 * Violet caches rates for up to 24h on their side. We use 12h to ensure
 * we get reasonably fresh rates while minimizing API calls (at most 2/day).
 */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface ExchangeRatesCache {
  /** The fetched rates (already USD-based). */
  rates: Record<string, number>;
  /** When this cache entry expires. */
  expiresAt: number;
  /** The date from Violet (e.g., "2026-04-16"). */
  date: string;
}

let _ratesCache: ExchangeRatesCache | null = null;

/**
 * Resets the exchange rates cache. Test-only utility.
 * @internal
 */
export function _resetExchangeRatesCache(): void {
  _ratesCache = null;
}

// ─── API call ───────────────────────────────────────────────────────

/**
 * Fetches the latest currency exchange rates from Violet.
 *
 * Calls `GET /catalog/currencies/latest?base_currency=USD` to get USD-based
 * rates for all supported currencies. Results are cached for 12 hours.
 *
 * ## Fallback behavior
 * - Returns cached rates if still fresh (within TTL)
 * - If the API call fails, returns `null` (callers should fall back to hardcodED rates)
 * - If Zod validation fails, returns `null`
 *
 * @param ctx - Catalog context with API base URL and token manager
 * @returns Exchange rates keyed by currency code (e.g., { EUR: 0.92, GBP: 0.79 }),
 *          or `null` if unavailable
 *
 * @see https://docs.violet.io/api-reference/catalog/currencies/currency-exchange-rates
 */
export async function getExchangeRates(
  ctx: CatalogContext,
): Promise<{ rates: Record<string, number>; date: string } | null> {
  // Return cached rates if still fresh
  if (_ratesCache && _ratesCache.expiresAt > Date.now()) {
    return { rates: _ratesCache.rates, date: _ratesCache.date };
  }

  // Fetch from Violet API
  const url = `${ctx.apiBase}/catalog/currencies/latest?base_currency=USD`;
  const result = await fetchWithRetry(url, { method: "GET" }, ctx.tokenManager);

  if (result.error) {
    // API call failed — return stale cache if available, otherwise null
    if (_ratesCache) {
      return { rates: _ratesCache.rates, date: _ratesCache.date };
    }
    return null;
  }

  // Validate response
  const parsed = violetExchangeRatesResponseSchema.safeParse(result.data);
  if (!parsed.success || !parsed.data.success) {
    if (_ratesCache) {
      return { rates: _ratesCache.rates, date: _ratesCache.date };
    }
    return null;
  }

  const { rates, date } = parsed.data;

  // Cache the fresh rates
  _ratesCache = {
    rates,
    expiresAt: Date.now() + CACHE_TTL_MS,
    date,
  };

  return { rates, date };
}
