/**
 * EEA country list and Stripe Platform country helpers.
 *
 * ## Context
 * Stripe Platform accounts have country-specific restrictions enforced by Violet:
 * - **US platform**: can onboard merchants in US + UK + EEA + CA + CH
 * - **EU/EEA platform (e.g., FR)**: can ONLY onboard merchants within the EEA
 * - **UK platform**: can ONLY onboard merchants within the EEA
 *
 * Our company is based in France → Stripe Platform account = EU/EEA.
 * In sandbox mode (Violet demo merchants are US-based Shopify stores), we use "US"
 * to match the sandbox environment. In production, we use "FR" (our actual country).
 *
 * ## Env var: STRIPE_ACCOUNT_COUNTRY
 * - Sandbox: `US` (Violet demo merchants are US stores)
 * - Production: `FR` (or any EEA country where the Stripe account is registered)
 *
 * @see https://docs.violet.io/prism/payments/payment-settings/supported-countries
 * @see https://docs.stripe.com/connect/cross-border-payouts
 * @see https://stripe.com/guides/strong-customer-authentication — PSD2/SCA
 */

/**
 * All 30 EEA countries (EU 27 + Iceland, Norway, Liechtenstein).
 *
 * These are the countries where an EU-based Stripe Platform account can:
 * - Onboard merchants via Violet Connect
 * - Process transfers (payouts to merchants)
 *
 * Cross-border fee: 0% within EEA and UK↔EEA.
 *
 * @see https://support.stripe.com/questions/countries-in-the-european-economic-area-eea-impacted-by-strong-customer-authentication-sca-regulation
 */
export const EEA_COUNTRIES = [
  "AT", // Austria
  "BE", // Belgium
  "BG", // Bulgaria
  "HR", // Croatia
  "CY", // Cyprus
  "CZ", // Czech Republic
  "DK", // Denmark
  "EE", // Estonia
  "FI", // Finland
  "FR", // France
  "DE", // Germany
  "GR", // Greece
  "HU", // Hungary
  "IS", // Iceland
  "IE", // Ireland
  "IT", // Italy
  "LV", // Latvia
  "LI", // Liechtenstein
  "LT", // Lithuania
  "LU", // Luxembourg
  "MT", // Malta
  "NL", // Netherlands
  "NO", // Norway
  "PL", // Poland
  "PT", // Portugal
  "RO", // Romania
  "SK", // Slovakia
  "SI", // Slovenia
  "ES", // Spain
  "SE", // Sweden
] as const;

/**
 * Countries supported for the shipping address country selector.
 *
 * Dynamically determined based on the Stripe Platform account country:
 * - **US platform** (sandbox): US + UK + EEA — matches Violet's cross-border support
 * - **EU/EEA platform** (production): EEA only — we can only work with EEA merchants
 *
 * UK is included in the US platform list because Stripe supports UK↔US transfers.
 * UK is NOT included for EU platforms (post-Brexit, Stripe treats UK separately for
 * EU platforms — but EEA platforms CAN transfer to UK via cross-border payouts).
 * We include UK for EU platforms too since Stripe doc confirms:
 * "Platforms based in the EEA can transfer funds to connected accounts in the US, UK, EEA, CA, and CH."
 *
 * @see https://docs.stripe.com/connect/cross-border-payouts — "Platforms based in the United States, United Kingdom, EEA, Canada, and Switzerland can transfer funds to connected accounts located in any of these same regions."
 */
export function getSupportedCountries(stripePlatformCountry: string): string[] {
  const eea = [...EEA_COUNTRIES];

  if (stripePlatformCountry === "US") {
    // Sandbox mode: US platform can work with US + UK + EEA merchants
    return ["US", "GB", ...eea];
  }

  // EU/EEA platform: can onboard EEA merchants + UK + US + CA + CH
  // (Stripe cross-border: "Platforms based in EEA can transfer to US, UK, EEA, CA, CH")
  // But Violet restricts EU platforms to EEA-only onboarding for now.
  // We include UK as it's practically supported via Stripe cross-border payouts.
  return ["GB", ...eea];
}

/**
 * Human-readable labels for supported countries.
 *
 * Covers all EEA countries + US + UK + CA + CH.
 */
export const COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  CH: "Switzerland",
  AT: "Austria",
  BE: "Belgium",
  BG: "Bulgaria",
  HR: "Croatia",
  CY: "Cyprus",
  CZ: "Czech Republic",
  DK: "Denmark",
  EE: "Estonia",
  FI: "Finland",
  FR: "France",
  DE: "Germany",
  GR: "Greece",
  HU: "Hungary",
  IS: "Iceland",
  IE: "Ireland",
  IT: "Italy",
  LV: "Latvia",
  LI: "Liechtenstein",
  LT: "Lithuania",
  LU: "Luxembourg",
  MT: "Malta",
  NL: "Netherlands",
  NO: "Norway",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  SK: "Slovakia",
  SI: "Slovenia",
  ES: "Spain",
  SE: "Sweden",
};

/**
 * Returns the default country code for the checkout address form
 * and country input placeholder.
 *
 * - **US platform** (sandbox): "US"
 * - **EU/EEA platform** (production): the platform's own country (e.g., "FR")
 */
export function getDefaultCountry(stripePlatformCountry: string): string {
  return stripePlatformCountry;
}
