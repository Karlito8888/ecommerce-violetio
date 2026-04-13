/**
 * Image URL optimization for Violet.io media transformations.
 *
 * Violet serves media via the merchant platform's CDN (Shopify, Cloudinary, etc.).
 * Most platforms support URL-based image resizing, which dramatically reduces
 * bandwidth and page load times when rendering product listings.
 *
 * ## Supported platforms
 *
 * | Platform     | Syntax                    | Example                                              |
 * |--------------|---------------------------|------------------------------------------------------|
 * | Shopify      | `?width=W&height=H`      | `cdn.shopify.com/.../img.jpeg?width=300&height=400`  |
 * | Cloudinary   | `/upload/w_W,h_H/`        | `res.cloudinary.com/.../upload/w_300,h_400/...`      |
 * | Wix          | `/fit/w_W,h_H/`           | `static.wixstatic.com/.../fit/w_300,h_400/file.jpg`  |
 * | Swell        | `?width=W&height=H`      | `cdn.schema.io/...?width=300&height=400`             |
 * | BigCommerce  | ❌ Not supported           |                                                      |
 * | Ecwid        | ❌ Not supported           |                                                      |
 * | SFCC         | ❌ Not supported           |                                                      |
 *
 * ## Usage
 *
 * ```ts
 * import { optimizeImageUrl } from "@ecommerce/shared";
 *
 * // Product card thumbnail (listing page)
 * const thumb = optimizeImageUrl(product.thumbnailUrl, { width: 300, height: 400 });
 *
 * // PDP thumbnail strip
 * const mini = optimizeImageUrl(img.url, { width: 80, height: 80 });
 *
 * // Skip optimization (returns original URL)
 * const original = optimizeImageUrl(product.thumbnailUrl);
 * ```
 *
 * @see https://docs.violet.io/prism/catalog/media-transformations
 */

/** Resize dimensions for CDN image transformation. */
export interface ImageResizeOptions {
  /** Target width in pixels. */
  width?: number;
  /** Target height in pixels. */
  height?: number;
}

/**
 * Optimizes a media URL by adding platform-specific resize parameters.
 *
 * Returns the original URL unchanged when:
 * - The URL is null/undefined/empty
 * - No resize options are provided
 * - The platform does not support transformations
 *
 * ## Shopify (primary platform for this project)
 *
 * Shopify's CDN accepts `?width=W&height=H` query parameters. The CDN
 * performs server-side resize and serves WebP/AVIF when the browser
 * supports it. Existing query params are preserved.
 *
 * ## Cloudinary (self-hosted platforms, Vendo)
 *
 * Cloudinary URLs contain `/upload/` in the path. Resize params are
 * inserted after `/upload/` as `w_W,h_H`. If the URL already has
 * transformation params (e.g., `c_limit,f_auto`), they are preserved
 * and the dimensions are prepended.
 *
 * @param url - Original media URL from Violet API
 * @param options - Resize dimensions (omit to return URL unchanged)
 * @returns Optimized URL with resize params, or original URL
 *
 * @see https://docs.violet.io/prism/catalog/media-transformations
 */
export function optimizeImageUrl(
  url: string | null | undefined,
  options?: ImageResizeOptions,
): string | null {
  if (!url || !options || (!options.width && !options.height)) {
    return url || null;
  }

  // ─── Shopify CDN ──────────────────────────────────────────────────
  // Pattern: cdn.shopify.com, cdn2.shopify.io, etc.
  // Syntax: ?width=W&height=H (appended as query params)
  if (isShopifyUrl(url)) {
    return appendQueryParams(url, options);
  }

  // ─── Cloudinary CDN ───────────────────────────────────────────────
  // Pattern: res.cloudinary.com or res-*.cloudinary.com
  // Syntax: /upload/w_W,h_H/ (inserted after /upload/)
  if (isCloudinaryUrl(url)) {
    return insertCloudinaryTransform(url, options);
  }

  // ─── Wix CDN ──────────────────────────────────────────────────────
  // Pattern: static.wixstatic.com
  // Syntax: /fit/w_W,h_H/ (in the path)
  if (isWixUrl(url)) {
    return insertWixTransform(url, options);
  }

  // ─── Swell CDN ────────────────────────────────────────────────────
  // Pattern: cdn.schema.io
  // Syntax: ?width=W&height=H (appended as query params)
  if (isSwellUrl(url)) {
    return appendQueryParams(url, options);
  }

  // Unsupported platform — return original URL
  return url;
}

// ─── Platform detection ────────────────────────────────────────────────

const SHOPIFY_HOSTNAMES = ["cdn.shopify.com", "cdn2.shopify.io", "cdn.shopify.io"];

function isShopifyUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return SHOPIFY_HOSTNAMES.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function isCloudinaryUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.includes("cloudinary.com");
  } catch {
    return false;
  }
}

function isWixUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes("wixstatic.com");
  } catch {
    return false;
  }
}

function isSwellUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes("cdn.schema.io");
  } catch {
    return false;
  }
}

// ─── Transform helpers ─────────────────────────────────────────────────

/**
 * Appends `width` and/or `height` as query parameters.
 *
 * Used by Shopify and Swell. Existing query params are preserved.
 * If `width`/`height` already exist, they are overwritten.
 */
function appendQueryParams(url: string, options: ImageResizeOptions): string {
  const parsed = new URL(url);
  if (options.width) parsed.searchParams.set("width", String(options.width));
  if (options.height) parsed.searchParams.set("height", String(options.height));
  return parsed.toString();
}

/**
 * Inserts Cloudinary transformation parameters after `/upload/`.
 *
 * Cloudinary URL format:
 * `https://res.cloudinary.com/{cloud}/image/upload/{existing_transforms}/v{version}/path`
 *
 * We insert `w_W,h_H` after `/upload/`. If existing transforms are present
 * (e.g., `c_limit,f_auto`), we prepend our dimensions.
 */
function insertCloudinaryTransform(url: string, options: ImageResizeOptions): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;

  const prefix = url.slice(0, idx + marker.length);
  const rest = url.slice(idx + marker.length);

  const dims = buildDimPair(options);

  // Check if there are existing transforms before the version/path segment
  // Cloudinary transforms look like: c_limit,f_auto,q_auto/
  if (rest.length > 0 && !rest.startsWith("v") && !rest.startsWith("http")) {
    // Existing transforms — prepend our dimensions
    return `${prefix}${dims},${rest}`;
  }

  // No existing transforms — insert ours before the path
  return `${prefix}${dims}/${rest}`;
}

/**
 * Inserts Wix transformation parameters in the `/fit/` path segment.
 *
 * Wix URL format:
 * `https://static.wixstatic.com/media/{id}/v1/fit/w_X,h_Y/file.jpg`
 */
function insertWixTransform(url: string, options: ImageResizeOptions): string {
  // Wix uses /fit/w_W,h_H/ in the path
  const fitMarker = "/fit/";
  const idx = url.indexOf(fitMarker);
  if (idx === -1) return url;

  const prefix = url.slice(0, idx + fitMarker.length);
  const rest = url.slice(idx + fitMarker.length);

  const dims = buildDimPair(options);

  // Check if existing dimensions (w_*,h_*) are present
  const dimPattern = /w_\d+,h_\d+/;
  if (dimPattern.test(rest)) {
    // Replace existing dimensions
    return `${prefix}${rest.replace(dimPattern, dims)}`;
  }

  return `${prefix}${dims}/${rest}`;
}

/**
 * Builds a `w_W,h_H` dimension string from options.
 *
 * Only includes dimensions that are provided. If only width is given,
 * returns just `w_W` (height will be auto-calculated by the CDN to
 * maintain aspect ratio).
 */
function buildDimPair(options: ImageResizeOptions): string {
  const parts: string[] = [];
  if (options.width) parts.push(`w_${options.width}`);
  if (options.height) parts.push(`h_${options.height}`);
  return parts.join(",");
}

// ─── Preset dimensions for common UI contexts ──────────────────────────

/**
 * Predefined resize presets for consistent image sizing across the app.
 *
 * These are sized for the most common rendering contexts. Each preset
 * corresponds to a specific UI component and viewport.
 *
 * @see https://docs.violet.io/prism/catalog/media-transformations
 */
export const IMAGE_PRESETS = {
  /** Product card in listing grids (3:4 ratio). ~30 KB per image. */
  productCard: { width: 300, height: 400 },
  /** Collection card cover image (4:3 ratio). ~35 KB per image. */
  collectionCard: { width: 400, height: 300 },
  /** PDP thumbnail strip. ~3 KB per image. */
  pdpThumb: { width: 80, height: 80 },
  /** Collection detail hero image (larger, but not full-size). ~80 KB. */
  collectionHero: { width: 800, height: 600 },
  /** Recommendation row product image. ~20 KB per image. */
  recommendation: { width: 200, height: 267 },
  /** Recently viewed row product image. ~20 KB per image. */
  recentlyViewed: { width: 200, height: 267 },
} as const;

export type ImagePreset = keyof typeof IMAGE_PRESETS;

/**
 * Convenience function: optimize a URL using a named preset.
 *
 * ```ts
 * const thumb = optimizeWithPreset(product.thumbnailUrl, "productCard");
 * ```
 */
export function optimizeWithPreset(
  url: string | null | undefined,
  preset: ImagePreset,
): string | null {
  return optimizeImageUrl(url, IMAGE_PRESETS[preset]);
}
