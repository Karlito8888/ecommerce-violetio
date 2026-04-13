/**
 * Violet snake_case → internal camelCase transformation functions.
 *
 * These pure functions transform Violet API response shapes into our
 * internal domain types. They have no side-effects and no API calls.
 *
 * Extracted from VioletAdapter so they can be tested and reused independently.
 */

import type {
  Product,
  ProductAlbum,
  ProductImage,
  ProductVariant,
  SKU,
  ShippingInfo,
  CountryOption,
  VioletOfferResponse,
  VioletSkuResponse,
  VioletAlbumResponse,
} from "../types/index.js";
import { getDeliveryEstimate, countryFlag } from "../utils/currency.js";

// ─── Offer transformation ──────────────────────────────────────────

/**
 * Transforms a Zod-validated Violet Offer into our internal Product type.
 *
 * This is the **sole boundary** where snake_case → camelCase conversion happens.
 * UI code must NEVER see Violet field names like `min_price` or `merchant_id`.
 *
 * After Zod validation with `.optional().default(...)`, all fields are guaranteed
 * present with sensible defaults, so no additional null checks are needed here.
 */
export function transformOffer(raw: VioletOfferResponse, countryCode?: string): Product {
  const albums = (raw.albums ?? []).map((a) => transformAlbum(a));
  const skuAlbums = (raw.skus ?? []).flatMap((s) => (s.albums ?? []).map((a) => transformAlbum(a)));
  const allAlbums = [...albums, ...skuAlbums];
  const images = extractImages(allAlbums);

  return {
    id: String(raw.id),
    name: raw.name,
    description: raw.description ?? "",
    htmlDescription: raw.html_description ?? null,
    minPrice: raw.min_price ?? 0,
    maxPrice: raw.max_price ?? 0,
    currency: raw.currency ?? "USD",
    available: raw.available ?? false,
    visible: raw.visible ?? true,
    status: (raw.status ?? "AVAILABLE") as Product["status"],
    publishingStatus: (raw.publishing_status ?? "NOT_PUBLISHED") as Product["publishingStatus"],
    source: raw.source ?? "",
    seller: raw.seller ?? "",
    vendor: raw.vendor ?? "",
    type: (raw.type ?? "PHYSICAL") as Product["type"],
    externalUrl: raw.external_url ?? "",
    merchantId: String(raw.merchant_id),
    productId: raw.product_id ?? "",
    commissionRate: raw.commission_rate ?? 0,
    tags: raw.tags ?? [],
    dateCreated: raw.date_created ?? "",
    dateLastModified: raw.date_last_modified ?? "",
    variants: (raw.variants ?? []).map(
      (v): ProductVariant => ({ name: v.name, values: v.values ?? [] }),
    ),
    skus: (raw.skus ?? []).map((s) => transformSku(s)),
    albums,
    images,
    thumbnailUrl: extractThumbnail(allAlbums),
    shippingInfo: buildShippingInfo(raw, countryCode),
    collectionIds:
      (
        (raw as unknown as Record<string, unknown>).collections as
          | Array<{ collection_id: number }>
          | undefined
      )?.map((c) => String(c.collection_id)) ?? [],
  };
}

// ─── SKU transformation ─────────────────────────────────────────────

/**
 * Transforms a Violet SKU to our internal SKU type.
 *
 * ## Variant value field name normalization (C3 fix)
 *
 * Violet's docs show `{ name, value }` but some API versions return
 * `{ variant, value }`. We normalize to `{ variant, value }`,
 * falling back to `name` if `variant` is absent.
 */
export function transformSku(raw: VioletSkuResponse): SKU {
  return {
    id: String(raw.id),
    offerId: String(raw.offer_id),
    merchantId: String(raw.merchant_id),
    name: raw.name ?? "",
    inStock: raw.in_stock ?? false,
    qtyAvailable: raw.qty_available ?? 0,
    salePrice: raw.sale_price ?? 0,
    retailPrice: raw.retail_price ?? 0,
    currency: raw.currency ?? "USD",
    taxable: raw.taxable ?? false,
    type: (raw.type ?? "PHYSICAL") as SKU["type"],
    status: raw.status ?? "AVAILABLE",
    variantValues: (raw.variant_values ?? []).map((vv) => ({
      variant: vv.variant ?? vv.name ?? "",
      value: vv.value,
    })),
    dimensions: raw.sku_dimensions
      ? { weight: raw.sku_dimensions.weight, type: raw.sku_dimensions.type }
      : null,
    albums: (raw.albums ?? []).map((a) => transformAlbum(a)),
    dateCreated: raw.date_created ?? "",
    dateLastModified: raw.date_last_modified ?? "",
  };
}

// ─── Album / Image helpers ──────────────────────────────────────────

export function transformAlbum(raw: VioletAlbumResponse): ProductAlbum {
  return {
    id: String(raw.id),
    type: raw.type,
    name: raw.name ?? "",
    media: (raw.media ?? []).map((m) => ({
      id: String(m.id),
      url: m.url,
      sourceUrl: m.source_url ?? "",
      type: m.type,
      displayOrder: m.display_order ?? 0,
      primary: m.primary ?? false,
    })),
    primaryMedia: raw.primary_media
      ? {
          id: String(raw.primary_media.id),
          url: raw.primary_media.url,
          sourceUrl: raw.primary_media.source_url ?? "",
          type: raw.primary_media.type,
          displayOrder: raw.primary_media.display_order ?? 0,
          primary: raw.primary_media.primary ?? false,
        }
      : null,
  };
}

export function extractImages(albums: ProductAlbum[]): ProductImage[] {
  const seen = new Set<string>();
  return albums
    .flatMap((album) => album.media)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .reduce<ProductImage[]>((acc, m) => {
      if (!seen.has(m.url)) {
        seen.add(m.url);
        acc.push({ id: m.id, url: m.url, displayOrder: m.displayOrder, primary: m.primary });
      }
      return acc;
    }, []);
}

/**
 * Extracts the best thumbnail URL from albums.
 *
 * Returns `null` (not empty string) when no images exist, so the UI can
 * distinguish "no image" from a valid URL and show a placeholder.
 *
 * @see M3 fix — previously returned "" which could cause `<img src="">` issues
 */
export function extractThumbnail(albums: ProductAlbum[]): string | null {
  for (const album of albums) {
    if (album.primaryMedia) return album.primaryMedia.url;
  }
  const images = extractImages(albums);
  return images[0]?.url ?? null;
}

// ─── Shipping info ──────────────────────────────────────────────────

/**
 * Build ShippingInfo from Violet's shipping zone data.
 *
 * - Shopify merchants with shipping zones: real data + delivery estimates
 * - Non-Shopify or missing data: source="OTHER", always shown, no estimate
 */
export function buildShippingInfo(
  raw: VioletOfferResponse,
  countryCode?: string,
): ShippingInfo | null {
  const source = raw.source ?? "";
  const shippingData = raw.shipping;

  // Non-Shopify merchant or no shipping data: show product with "Shipping TBD"
  if (source !== "SHOPIFY" || !shippingData) {
    return {
      shipsToUserCountry: true,
      shippingZones: [],
      deliveryEstimate: null,
      source: "OTHER",
    };
  }

  const zones = (shippingData.shipping_zones ?? []).map((z) => ({
    countryCode: z.country_code,
    countryName: z.country_name,
  }));

  // No country context — return zones but can't determine shipping eligibility
  if (!countryCode) {
    return {
      shipsToUserCountry: true,
      shippingZones: zones,
      deliveryEstimate: null,
      source: "SHOPIFY",
    };
  }

  const shipsToUser = zones.length === 0 || zones.some((z) => z.countryCode === countryCode);

  // Infer merchant origin from seller field or default to US.
  const merchantOrigin = inferMerchantOrigin(raw.seller ?? "");
  const estimate = shipsToUser ? getDeliveryEstimate(merchantOrigin, countryCode) : null;

  return {
    shipsToUserCountry: shipsToUser,
    shippingZones: zones,
    deliveryEstimate: estimate,
    source: "SHOPIFY",
  };
}

/**
 * Best-effort merchant origin inference.
 * In the future, Violet may expose merchant country directly.
 * For now, defaults to "US" which is correct for most Violet sandbox merchants.
 */
export function inferMerchantOrigin(_seller: string): string {
  // Placeholder: when Violet exposes merchant.country, use it here.
  return "US";
}

// ─── Country extraction ─────────────────────────────────────────────

/**
 * Aggregate all available shipping countries across Shopify offers.
 * Used by the CountrySelector to show countries with deliverable products.
 *
 * NOTE: Fetches up to 200 offers. For catalogs with 200+ offers, country counts
 * may be undercounted.
 */
export function aggregateCountries(offers: VioletOfferResponse[]): CountryOption[] {
  const countryMap = new Map<string, { name: string; count: number }>();
  for (const offer of offers) {
    if (offer.source !== "SHOPIFY" || !offer.shipping) continue;
    for (const zone of offer.shipping.shipping_zones ?? []) {
      const existing = countryMap.get(zone.country_code);
      if (existing) {
        existing.count++;
      } else {
        countryMap.set(zone.country_code, {
          name: zone.country_name,
          count: 1,
        });
      }
    }
  }

  return Array.from(countryMap.entries())
    .map(([code, { name, count }]) => ({
      code,
      name,
      flag: countryFlag(code),
      productCount: count,
    }))
    .sort((a, b) => b.productCount - a.productCount);
}
