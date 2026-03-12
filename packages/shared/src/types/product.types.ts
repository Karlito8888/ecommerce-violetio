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
}

/** Query parameters for listing/filtering products. */
export interface ProductQuery {
  category?: string;
  page?: number;
  pageSize?: number;
  merchantId?: string;
  query?: string;
}
