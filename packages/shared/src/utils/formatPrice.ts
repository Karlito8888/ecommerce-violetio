/**
 * Format an ISO 8601 date string as a human-readable date.
 *
 * @param isoDate - ISO 8601 date string (e.g., "2026-03-16T10:00:00Z")
 * @param monthFormat - "short" (Mar) for compact lists, "long" (March) for detail views
 * @param locale - BCP 47 locale tag (default: "en-US")
 * @returns Formatted date string, or the original string if parsing fails
 */
export function formatDate(
  isoDate: string,
  monthFormat: "short" | "long" = "short",
  locale: string = "en-US",
): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: monthFormat,
      day: "numeric",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

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
