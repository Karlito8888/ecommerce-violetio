import type { ProductMatch } from "@ecommerce/shared";
import BaseProductCard from "../product/BaseProductCard";

/**
 * Product card adapted for search results.
 *
 * Thin wrapper around BaseProductCard that maps `ProductMatch` (minimal ~11 fields
 * from pgvector search) to the base card's props interface.
 *
 * ## Epic 3 Review — Fix S2: Deduplication
 *
 * Previously this component duplicated ~50 lines of JSX from ProductCard.
 * Now both delegate to BaseProductCard, differing only in the merchant name
 * field: SearchProductCard uses `product.vendor` (from Violet enrichment in
 * the search Edge Function) while ProductCard uses `product.seller`.
 *
 * @see BaseProductCard — shared markup and BEM class documentation
 * @see ProductCard — catalog listing variant using full Product type
 */
export default function SearchProductCard({ product }: { product: ProductMatch }) {
  return (
    <BaseProductCard
      id={product.id}
      name={product.name}
      merchantName={product.vendor}
      thumbnailUrl={product.thumbnailUrl}
      available={product.available}
      minPrice={product.minPrice}
      currency={product.currency}
    />
  );
}
