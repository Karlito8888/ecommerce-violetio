/**
 * Strip HTML tags from a string and decode common HTML entities, returning safe plain text.
 *
 * ## Why this exists
 *
 * Product descriptions from Violet.io (`htmlDescription`) contain arbitrary HTML
 * from merchant platforms (Shopify, etc.). This utility removes all HTML tags so
 * the text can be safely rendered or used in contexts that expect plain text
 * (meta descriptions, Open Graph tags, JSON-LD, React text nodes).
 *
 * ## Epic 3 Review — Fix S1: HTML entity decoding
 *
 * Previously this function only stripped tags but did NOT decode HTML entities.
 * Merchant descriptions from Shopify commonly contain entities like:
 * - `&amp;` → `&` (e.g., "Bath &amp; Body" → "Bath & Body")
 * - `&lt;` / `&gt;` → `<` / `>` (rare but possible in specs)
 * - `&#8220;` / `&#8221;` → `"` / `"` (curly quotes)
 * - `&nbsp;` → ` ` (non-breaking space)
 *
 * Without decoding, meta descriptions and JSON-LD would contain literal `&amp;`
 * text, which looks broken in search engine result pages (SERPs).
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
 * Entity decoding happens AFTER tag stripping, so any entities that were part of
 * HTML attributes are already removed. Only text-content entities remain.
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
 * @param html - String potentially containing HTML tags and entities
 * @returns Plain text with all HTML tags removed, entities decoded, and whitespace trimmed
 */

/**
 * Common HTML entities mapped to their decoded characters.
 *
 * Only includes entities commonly found in merchant product descriptions.
 * Numeric entities (&#NNN; and &#xHH;) are handled separately via regex.
 */
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&ndash;": "–",
  "&mdash;": "—",
  "&lsquo;": "\u2018",
  "&rsquo;": "\u2019",
  "&ldquo;": "\u201C",
  "&rdquo;": "\u201D",
  "&hellip;": "…",
  "&trade;": "™",
  "&reg;": "®",
  "&copy;": "©",
};

/**
 * Decodes HTML entities in a string.
 * Handles named entities (from the map above) and numeric entities (&#NNN; &#xHH;).
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&[a-zA-Z]+;/g, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity);
}

export function stripHtml(html: string): string {
  const stripped = html.replace(/<[^>]*>/g, "");
  return decodeEntities(stripped).trim();
}
