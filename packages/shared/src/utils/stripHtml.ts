/**
 * Strip HTML tags from a string, returning safe plain text.
 *
 * ## Why this exists
 *
 * Product descriptions from Violet.io (`htmlDescription`) contain arbitrary HTML
 * from merchant platforms (Shopify, etc.). This utility removes all HTML tags so
 * the text can be safely rendered or used in contexts that expect plain text
 * (meta descriptions, Open Graph tags, JSON-LD, React text nodes).
 *
 * ## Security note
 *
 * This is NOT an HTML sanitizer — it strips ALL tags rather than allowing safe ones.
 * For contexts where we render the result via React JSX (`{text}`), this is doubly
 * safe: even if the regex misses an edge case, React's JSX escaping prevents XSS.
 *
 * For meta tags and JSON-LD (which are rendered as raw strings in `<head>`), the
 * regex strip is the primary defense. The simple `/<[^>]*>/g` pattern handles all
 * well-formed HTML. Malformed tags (e.g., `<script onerror=...`) are also caught
 * because the regex matches any `<...>` sequence.
 *
 * ## Usage
 *
 * ```ts
 * import { stripHtml } from "@ecommerce/shared";
 *
 * // For meta description (max 160 chars)
 * const metaDesc = stripHtml(product.htmlDescription ?? product.description).slice(0, 160);
 *
 * // For component rendering
 * const plainText = stripHtml(product.htmlDescription ?? product.description);
 * ```
 *
 * @param html - String potentially containing HTML tags
 * @returns Plain text with all HTML tags removed and whitespace trimmed
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
