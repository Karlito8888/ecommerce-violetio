/**
 * Mobile fetch function for the get-products Edge Function.
 *
 * Implements the ProductsFetchFn interface from @ecommerce/shared so the shared
 * productsInfiniteQueryOptions hook works on mobile via Supabase Edge Functions
 * (Violet credentials stay server-side, never in the JS bundle).
 */
import Constants from "expo-constants";
import type { ProductsFetchFn } from "@ecommerce/shared";
import { getCurrencyForCountry } from "@ecommerce/shared";
import * as Localization from "expo-localization";

function getSupabaseUrl(): string {
  return (
    Constants.expoConfig?.extra?.supabaseUrl ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    "http://10.0.2.2:54321"
  );
}

function getAnonKey(): string {
  return (
    Constants.expoConfig?.extra?.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""
  );
}

/**
 * Derives the user's base currency from device locale region.
 * Falls back to null (Violet will use merchant default currency = USD).
 *
 * @see https://docs.violet.io/prism/catalog/contextual-pricing
 */
function getDeviceCurrency(): string | null {
  const region = Localization.getLocales()[0]?.regionCode;
  if (!region) return null;
  const currency = getCurrencyForCountry(region);
  return currency !== "USD" ? currency : null;
}

export const fetchProductsMobile: ProductsFetchFn = async (params) => {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getAnonKey();
  const baseCurrency = getDeviceCurrency();

  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.category) qs.set("category", params.category);
  if (params.minPrice !== undefined) qs.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) qs.set("maxPrice", String(params.maxPrice));
  if (params.inStock === true) qs.set("inStock", "true");
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDirection) qs.set("sortDirection", params.sortDirection);
  if (baseCurrency) qs.set("baseCurrency", baseCurrency);

  const url = `${supabaseUrl}/functions/v1/get-products?${qs}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });

  if (!res.ok) {
    return {
      data: null,
      error: {
        code: "GET_PRODUCTS.HTTP_ERROR",
        message: `Edge Function returned ${res.status}`,
      },
    };
  }

  return res.json();
};
