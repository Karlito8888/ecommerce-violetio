/**
 * Server function for fetching live currency exchange rates from Violet.
 *
 * Calls `GET /catalog/currencies/latest` via VioletAdapter and injects
 * the rates into the shared `currency.ts` module via `setLiveExchangeRates()`.
 *
 * ## Caching
 * - Violet caches rates for up to 24 hours on their side
 * - VioletAdapter caches in memory for 12 hours (`violetCurrency.ts`)
 * - This server function is called from the root layout loader (SSR)
 *
 * ## Client hydration
 * The rates are returned to the client so `setLiveExchangeRates()` can be
 * called client-side too — making `convertPrice()` use live rates for
 * subsequent client-side renders.
 *
 * @see https://docs.violet.io/api-reference/catalog/currencies/currency-exchange-rates
 */

import { createServerFn } from "@tanstack/react-start";
import { setLiveExchangeRates } from "@ecommerce/shared";
import { getAdapter } from "./violetAdapter";

export const getExchangeRatesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ rates: Record<string, number>; date: string } | null> => {
    try {
      const adapter = getAdapter();
      const result = await adapter.getExchangeRates();

      if (result.data) {
        // Inject live rates into the shared module for SSR
        setLiveExchangeRates(result.data.rates, result.data.date);
        return result.data;
      }

      return null;
    } catch {
      // Non-critical: fallback hardcodED rates will be used
      return null;
    }
  },
);
