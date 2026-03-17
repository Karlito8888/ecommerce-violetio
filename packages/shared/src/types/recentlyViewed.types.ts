/**
 * Recently viewed product entry stored in localStorage / expo-secure-store.
 * Lightweight — only stores the product ID and timestamp.
 * Full product data is fetched live from Violet API when rendering.
 */
export interface RecentlyViewedEntry {
  productId: string;
  viewedAt: string;
}

/**
 * Enriched recently viewed item ready for rendering in BaseProductCard.
 * Shape matches BaseProductCardProps exactly so no adapter is needed.
 */
export interface RecentlyViewedItem {
  id: string;
  name: string;
  merchantName: string;
  thumbnailUrl: string | null;
  available: boolean;
  minPrice: number;
  currency: string;
}
