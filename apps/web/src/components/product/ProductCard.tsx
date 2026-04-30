import type { Product } from "@ecommerce/shared";
import BaseProductCard from "./BaseProductCard";

import "./ProductCard.css";

/**
 * Product card for catalog listing pages.
 *
 * Thin wrapper around BaseProductCard that maps the full `Product` type
 * (from Violet catalog API) to the base card's minimal props interface.
 *
 * ## Epic 3 Review — Fix S2: Deduplication
 *
 * Previously this component contained ~40 lines of JSX identical to
 * SearchProductCard. Now both delegate to BaseProductCard, differing only
 * in which field provides the merchant name:
 * - ProductCard: `product.seller` (from Violet Offer.seller)
 * - SearchProductCard: `product.vendor` (from pgvector enrichment)
 *
 * @see BaseProductCard — shared markup and BEM class documentation
 * @see SearchProductCard — search result variant using ProductMatch type
 */
export default function ProductCard({ product }: { product: Product }) {
  return (
    <BaseProductCard
      id={product.id}
      name={product.name}
      merchantName={product.seller}
      merchantId={product.merchantId}
      thumbnailUrl={product.thumbnailUrl}
      available={product.available}
      minPrice={product.minPrice}
      currency={product.currency}
    />
  );
}
