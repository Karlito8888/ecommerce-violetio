/**
 * Edge Function: get-exchange-rates
 *
 * Fetches live currency exchange rates from Violet's API.
 * Called by the mobile app at startup to populate `convertPrice()` with live rates.
 *
 * ## Violet API
 * GET /catalog/currencies/latest?base_currency=USD
 *
 * ## Caching
 * Violet caches rates for up to 24h. The mobile client should cache the response
 * locally for 12 hours (matching the server-side cache TTL in violetCurrency.ts).
 *
 * @see https://docs.violet.io/api-reference/catalog/currencies/currency-exchange-rates
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getVioletHeaders } from "../_shared/violetAuth.ts";

const VIOLET_API_BASE = Deno.env.get("VIOLET_API_BASE") ?? "https://sandbox-api.violet.io/v1";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const headers = await getVioletHeaders();
    const url = `${VIOLET_API_BASE}/catalog/currencies/latest?base_currency=USD`;

    const response = await fetch(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return Response.json(
        {
          error: {
            code: "VIOLET.API_ERROR",
            message: `Violet API error (${response.status}): ${errorBody}`.slice(0, 500),
          },
        },
        { status: response.status, headers: corsHeaders },
      );
    }

    const data = await response.json();

    return Response.json({ data }, { headers: corsHeaders });
  } catch (err) {
    return Response.json(
      {
        error: {
          code: "VIOLET.NETWORK_ERROR",
          message: err instanceof Error ? err.message : "Unknown network error",
        },
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
