/**
 * Product-related placeholder types.
 * Full implementation in Story 3.1 (Violet catalog adapter & product types).
 */

/** Represents a single product in the catalog. */
export interface Product {
  id: string;
  name: string;
  description: string;
  /** Price in integer cents (e.g., 1999 = $19.99) */
  retailPrice: number;
  thumbnailUrl: string;
  offers: Offer[];
}

/** A product offer from a specific merchant/supplier. */
export interface Offer {
  id: string;
  productId: string;
  merchantId: string;
  skus: SKU[];
}

/** A stock keeping unit — a specific product variant (size, color, etc.). */
export interface SKU {
  id: string;
  offerId: string;
  /** Price in integer cents */
  salePrice: number;
  available: boolean;
  attributes: Record<string, string>;
}

/** Query parameters for listing/filtering products. */
export interface ProductQuery {
  category?: string;
  page?: number;
  pageSize?: number;
  merchantId?: string;
}
