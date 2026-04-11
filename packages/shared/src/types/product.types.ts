/**
 * Product domain types mapped from Violet.io's Offer data model.
 *
 * Violet "Offer" → our "Product"
 * Violet "SKU" → our "SKU" (purchasable variant)
 *
 * All prices are in integer cents (e.g., 1999 = $19.99).
 * All IDs are strings internally (Violet uses numeric IDs, cast at adapter boundary).
 * All field names are camelCase (Violet sends snake_case, transformed at adapter boundary).
 */

import type { ShippingInfo } from "./shipping.types.js";

/**
 * Offer status from Violet API.
 *
 * The Violet HTML docs list: AVAILABLE | DISABLED | ARCHIVED | FOR_DELETION.
 * However, actual API responses also return compound statuses like
 * UNAVAILABLE, DISABLED_AVAILABLE, DISABLED_UNAVAILABLE.
 *
 * We keep the union of all observed values for type safety, but the Zod schema
 * uses `z.string()` as a catch-all to avoid breaking on unknown future statuses.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers
 */
export type OfferStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "DISABLED"
  | "DISABLED_AVAILABLE"
  | "DISABLED_UNAVAILABLE"
  | "ARCHIVED"
  | "FOR_DELETION";

/**
 * Publishing status from Violet API.
 * Used as a string in the Zod schema for forward compatibility.
 */
export type PublishingStatus = "PUBLISHED" | "NOT_PUBLISHED";

/** Product type (physical or digital goods). */
export type ProductType = "PHYSICAL" | "DIGITAL";

/** SKU type from Violet API. */
export type SkuType = "PHYSICAL" | "DIGITAL" | "VIRTUAL" | "BUNDLED";

/** A single media item (image) within an album. */
export interface ProductMedia {
  id: string;
  url: string;
  sourceUrl: string;
  type: "IMAGE";
  displayOrder: number;
  primary: boolean;
}

/** A media album attached to an offer or SKU. */
export interface ProductAlbum {
  id: string;
  type: "OFFER" | "SKU";
  name: string;
  media: ProductMedia[];
  primaryMedia: ProductMedia | null;
}

/** An image reference (simplified from album/media). */
export interface ProductImage {
  id: string;
  url: string;
  displayOrder: number;
  primary: boolean;
}

/** A variant dimension (e.g., "Color": "Red"). */
export interface VariantValue {
  variant: string;
  value: string;
}

/** A variant definition on the offer. */
export interface ProductVariant {
  name: string;
  values: string[];
}

/** SKU dimensions (weight/shipping info). */
export interface SkuDimensions {
  weight: number;
  type: string;
}

/** A stock keeping unit — a specific product variant (size, color, etc.). */
export interface SKU {
  id: string;
  offerId: string;
  merchantId: string;
  name: string;
  inStock: boolean;
  qtyAvailable: number;
  /** Current selling price in integer cents. */
  salePrice: number;
  /** Original/list price in integer cents. */
  retailPrice: number;
  currency: string;
  taxable: boolean;
  type: SkuType;
  status: string;
  variantValues: VariantValue[];
  dimensions: SkuDimensions | null;
  albums: ProductAlbum[];
  dateCreated: string;
  dateLastModified: string;
}

/** A product offer from a specific merchant/supplier (maps from Violet "Offer"). */
export interface Offer {
  id: string;
  productId: string;
  merchantId: string;
  skus: SKU[];
}

/** Represents a single product in the catalog (mapped from Violet Offer). */
export interface Product {
  id: string;
  name: string;
  description: string;
  htmlDescription: string | null;
  /** Lowest SKU price in integer cents. */
  minPrice: number;
  /** Highest SKU price in integer cents. */
  maxPrice: number;
  currency: string;
  available: boolean;
  visible: boolean;
  status: OfferStatus;
  publishingStatus: PublishingStatus;
  source: string;
  seller: string;
  vendor: string;
  type: ProductType;
  externalUrl: string;
  merchantId: string;
  productId: string;
  commissionRate: number;
  tags: string[];
  dateCreated: string;
  dateLastModified: string;
  variants: ProductVariant[];
  skus: SKU[];
  albums: ProductAlbum[];
  images: ProductImage[];
  /**
   * URL of the primary/first image, or `null` if the product has no images.
   *
   * Returns `null` (not empty string) so consumers can distinguish
   * "no image available" from a valid URL. In UI, use a placeholder
   * image when this is `null`.
   */
  thumbnailUrl: string | null;
  /** Geo-filtered shipping info. `null` when no country context is available. */
  shippingInfo: ShippingInfo | null;
}

/**
 * Query parameters for listing/filtering products.
 *
 * Maps to Violet's `POST /catalog/offers/search` request body + query params.
 *
 * ## Filter fields (body params → snake_case in Violet)
 * - `minPrice` / `maxPrice` — integer **cents** (e.g., 5000 = $50.00).
 *   Sent as `min_price` / `max_price` in the Violet request body.
 * - `inStock` — boolean; sent as `available: true` in the body.
 *
 * ## Sort fields (body params — only when `beta=false`)
 * - `sortBy` — camelCase Offer property name for Violet's `sort_by`
 *   (e.g., `"price"` maps to `sort_by: "minPrice"`).
 * - `sortDirection` — `"ASC"` or `"DESC"`.
 *
 * **CRITICAL**: `sort_by` uses camelCase property names (`minPrice`, `name`),
 * NOT snake_case. `min_price` is for *filtering*, `minPrice` is for *sorting*.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
 */
export interface ProductQuery {
  category?: string;
  page?: number;
  pageSize?: number;
  merchantId?: string;
  query?: string;
  /** Minimum price filter in integer cents (e.g., 5000 = $50.00). */
  minPrice?: number;
  /** Maximum price filter in integer cents (e.g., 10000 = $100.00). */
  maxPrice?: number;
  /** When `true`, only return in-stock products. Sent as `available: true` to Violet. */
  inStock?: boolean;
  /**
   * Sort field. `"price"` maps to Violet's `sort_by: "minPrice"`.
   * `"relevance"` (or omitted) uses Violet's default ordering.
   */
  sortBy?: "relevance" | "price";
  /** Sort direction. Only meaningful when `sortBy` is set. */
  sortDirection?: "ASC" | "DESC";
}

/**
 * A single category for navigation/filtering.
 *
 * Returned by Violet's `GET /catalog/categories` endpoint, mapped to a
 * platform-agnostic type at the adapter boundary.
 *
 * - `slug`: URL-friendly identifier (used as React key, URL param)
 * - `label`: Display text shown in chips/nav
 * - `filter`: Value sent as `source_category_name` to Violet's search API.
 *   `undefined` means "show all products" (no category filter).
 *
 * @see https://docs.violet.io/api-reference/catalog/categories/get-categories
 */
export interface CategoryItem {
  slug: string;
  label: string;
  filter: string | undefined;
}

// ─── Collection Types ─────────────────────────────────────────────────

/**
 * Collection type — how the collection was curated.
 *
 * - CUSTOM: Manually curated by the merchant (each offer selected individually)
 * - AUTOMATED: Rule-based selection by the platform (e.g., "all blue products")
 *
 * @see https://docs.violet.io/prism/catalog/collections
 */
export type CollectionType = "CUSTOM" | "AUTOMATED";

/**
 * A merchant-curated collection of products.
 *
 * Collections are groups of offers (products) organized by merchants
 * to enhance the shopping experience (e.g., "Summer Sale", "Best Sellers",
 * "New Arrivals"). Synced daily from Shopify when `sync_collections` flag
 * is enabled.
 *
 * @see https://docs.violet.io/prism/catalog/collections
 */
export interface CollectionItem {
  id: string;
  merchantId: string;
  name: string;
  description: string;
  type: CollectionType;
  externalId: string;
  imageUrl: string | null;
  sortOrder: number;
  /** Number of products in this collection. Fetched separately or cached. */
  productCount: number;
  dateCreated: string;
  dateLastModified: string;
}

// ─── Metadata Types ───────────────────────────────────────────────────

/**
 * Metadata value type from Violet API.
 *
 * Maps to Shopify metafield types.
 *
 * @see https://docs.violet.io/prism/catalog/metadata-syncing
 */
export type MetadataValueType = "STRING" | "JSON" | "INTEGER" | "LONG" | "DECIMAL" | "BOOLEAN";

/**
 * A single metadata key-value pair from a merchant's custom product data.
 *
 * Merchants can add custom data to their products via Shopify metafields.
 * Examples: material, color, size_guide, care_instructions, label, origin.
 *
 * When `type` is `"JSON"`, the `value` field contains a serialized JSON string
 * that must be parsed separately.
 *
 * Requires `sync_metadata` (for Offer-level) or `sync_sku_metadata` (for SKU-level)
 * feature flags enabled per merchant, AND the `include=metadata` or
 * `include=sku_metadata` query parameter on the API call.
 *
 * @see https://docs.violet.io/prism/catalog/metadata-syncing
 * @see https://docs.violet.io/prism/catalog/metadata-syncing/sku-metadata
 */
export interface MetadataItem {
  version: number;
  type: MetadataValueType;
  externalType: string;
  key: string;
  value: string;
  source: "INTERNAL" | "EXTERNAL";
}
