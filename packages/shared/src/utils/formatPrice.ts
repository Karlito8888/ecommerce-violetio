/**
 * Format an integer cent amount as a localized currency string.
 *
 * Money is ALWAYS stored as integer cents. This is the ONLY place where
 * cents are converted to a display string. Never do this conversion elsewhere.
 *
 * @param cents - Amount in integer cents (e.g., 1999 → "$19.99")
 * @param currency - ISO 4217 currency code (default: "USD")
 * @param locale - BCP 47 locale tag (default: "en-US")
 * @returns Localized currency string
 */
export function formatPrice(
  cents: number,
  currency: string = "USD",
  locale: string = "en-US",
): string {
  if (!Number.isFinite(cents)) {
    throw new RangeError(`formatPrice: expected finite integer cents, got ${cents}`);
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(Math.round(cents) / 100);
}
