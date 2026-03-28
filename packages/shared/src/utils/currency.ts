/**
 * Currency conversion utilities and delivery estimate fallback tables.
 *
 * Exchange rates are approximate (last updated: 2026-03-28).
 * All prices remain in USD for cart/checkout — local currency is informational only.
 */

import type { DeliveryEstimate } from "../types/shipping.types.js";

/** Date these rates were last updated. Check monthly. */
export const RATES_LAST_UPDATED = "2026-03-28";

/**
 * Approximate USD → target currency multipliers.
 * Update periodically (monthly recommended).
 * Last updated: {@link RATES_LAST_UPDATED}
 */
export const EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.53,
  JPY: 151.5,
  CHF: 0.88,
  SEK: 10.42,
  NOK: 10.68,
  DKK: 6.87,
  PLN: 3.97,
  CZK: 23.2,
  HUF: 363.5,
  RON: 4.58,
  BGN: 1.8,
  MXN: 17.1,
  BRL: 4.97,
  INR: 83.4,
  KRW: 1335,
  NZD: 1.64,
  SGD: 1.34,
  HKD: 7.82,
  TRY: 32.5,
  ZAR: 18.6,
};

/** Country code → currency code mapping for common shipping destinations. */
export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: "USD",
  FR: "EUR",
  DE: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  PT: "EUR",
  IE: "EUR",
  FI: "EUR",
  GR: "EUR",
  LU: "EUR",
  SK: "EUR",
  SI: "EUR",
  EE: "EUR",
  LV: "EUR",
  LT: "EUR",
  MT: "EUR",
  CY: "EUR",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  JP: "JPY",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  BG: "BGN",
  HR: "EUR",
  MX: "MXN",
  BR: "BRL",
  IN: "INR",
  KR: "KRW",
  NZ: "NZD",
  SG: "SGD",
  HK: "HKD",
  TR: "TRY",
  ZA: "ZAR",
};

/** Currency display symbols. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
  CAD: "CA$",
  AUD: "A$",
  JPY: "\u00A5",
  CHF: "CHF\u00A0",
  SEK: "kr\u00A0",
  NOK: "kr\u00A0",
  DKK: "kr\u00A0",
  PLN: "z\u0142\u00A0",
  CZK: "K\u010D\u00A0",
  BRL: "R$",
  MXN: "MX$",
  INR: "\u20B9",
  KRW: "\u20A9",
  NZD: "NZ$",
  SGD: "S$",
  HKD: "HK$",
  TRY: "\u20BA",
  ZAR: "R\u00A0",
};

const EU_COUNTRIES = new Set([
  "FR",
  "DE",
  "IT",
  "ES",
  "NL",
  "BE",
  "AT",
  "PT",
  "IE",
  "FI",
  "GR",
  "LU",
  "SK",
  "SI",
  "EE",
  "LV",
  "LT",
  "MT",
  "CY",
  "HR",
  "RO",
  "BG",
  "HU",
  "PL",
  "CZ",
  "DK",
  "SE",
]);

/**
 * Delivery estimate fallback table keyed by origin-destination region pair.
 * Used when Violet doesn't provide min_days/max_days.
 */
export const DELIVERY_ESTIMATE_FALLBACK: Record<string, DeliveryEstimate> = {
  "US-US": { minDays: 3, maxDays: 7, label: "3-7 business days" },
  "US-CA": { minDays: 5, maxDays: 10, label: "5-10 business days" },
  "US-EU": { minDays: 7, maxDays: 14, label: "7-14 business days" },
  "US-GB": { minDays: 7, maxDays: 14, label: "7-14 business days" },
  "US-AU": { minDays: 10, maxDays: 21, label: "10-21 business days" },
  "US-JP": { minDays: 7, maxDays: 14, label: "7-14 business days" },
  "US-INTL": { minDays: 10, maxDays: 25, label: "10-25 business days" },
  "EU-EU": { minDays: 2, maxDays: 5, label: "2-5 business days" },
  "EU-GB": { minDays: 3, maxDays: 7, label: "3-7 business days" },
  "EU-US": { minDays: 7, maxDays: 14, label: "7-14 business days" },
  "EU-INTL": { minDays: 10, maxDays: 25, label: "10-25 business days" },
  "GB-GB": { minDays: 1, maxDays: 3, label: "1-3 business days" },
  "GB-EU": { minDays: 3, maxDays: 7, label: "3-7 business days" },
  "GB-US": { minDays: 7, maxDays: 14, label: "7-14 business days" },
  "GB-INTL": { minDays: 10, maxDays: 25, label: "10-25 business days" },
  FALLBACK: { minDays: 10, maxDays: 30, label: "10-30 business days" },
};

function getRegion(countryCode: string): string {
  if (countryCode === "US") return "US";
  if (countryCode === "GB") return "GB";
  if (countryCode === "CA") return "CA";
  if (EU_COUNTRIES.has(countryCode)) return "EU";
  return "INTL";
}

/** Convert price in integer cents from one currency to another. */
export function convertPrice(cents: number, fromCurrency: string, toCurrency: string): number {
  if (fromCurrency === toCurrency) return cents;
  const fromRate = EXCHANGE_RATES[fromCurrency] ?? 1;
  const toRate = EXCHANGE_RATES[toCurrency] ?? 1;
  return Math.round((cents / fromRate) * toRate);
}

/** Format integer cents as a localized price string with currency symbol. */
export function formatLocalPrice(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency}\u00A0`;
  const zeroDecimalCurrencies = new Set(["JPY", "KRW", "HUF"]);

  if (zeroDecimalCurrencies.has(currency)) {
    return `${symbol}${Math.round(cents / 100).toLocaleString()}`;
  }

  return `${symbol}${(cents / 100).toFixed(2)}`;
}

/**
 * Get delivery estimate for a route. Uses Violet data when available,
 * falls back to region-based estimate table.
 */
export function getDeliveryEstimate(
  fromCountry: string,
  toCountry: string,
  violetMinDays?: number,
  violetMaxDays?: number,
): DeliveryEstimate {
  if (violetMinDays != null && violetMaxDays != null) {
    return {
      minDays: violetMinDays,
      maxDays: violetMaxDays,
      label: `${violetMinDays}-${violetMaxDays} business days`,
    };
  }

  const fromRegion = getRegion(fromCountry);
  const toRegion = getRegion(toCountry);

  // Try exact match first, then region fallback
  const key = `${fromRegion}-${toRegion}`;
  return DELIVERY_ESTIMATE_FALLBACK[key] ?? DELIVERY_ESTIMATE_FALLBACK["FALLBACK"];
}

/** Get the currency code for a country. Returns "USD" for unknown countries. */
export function getCurrencyForCountry(countryCode: string): string {
  return COUNTRY_TO_CURRENCY[countryCode] ?? "USD";
}

/** Common country names for the ~30 most frequent shipping destinations. */
export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  FR: "France",
  DE: "Germany",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  BE: "Belgium",
  AT: "Austria",
  CH: "Switzerland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  IE: "Ireland",
  PT: "Portugal",
  PL: "Poland",
  CZ: "Czech Republic",
  RO: "Romania",
  GR: "Greece",
  HU: "Hungary",
  AU: "Australia",
  NZ: "New Zealand",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  HK: "Hong Kong",
  MX: "Mexico",
  BR: "Brazil",
};

/** Resolve country code to display name. Returns uppercase code for unknown countries. */
export function getCountryName(code: string | null): string | null {
  if (!code) return null;
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/** Convert ISO 3166-1 alpha-2 country code to flag emoji. */
export function countryFlag(code: string): string {
  const upper = code.toUpperCase();
  if (upper.length !== 2) return "";
  return String.fromCodePoint(...upper.split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
