import Skeleton from "../Skeleton";

/**
 * Skeleton loading state for the product grid.
 *
 * Renders 12 placeholder cards (matching default pageSize) in the same
 * responsive grid layout as ProductGrid. Each card mimics the ProductCard
 * anatomy: image rectangle (3:4) + 3 text lines (name, merchant, price).
 *
 * Uses the existing `Skeleton` component with appropriate variants.
 * `aria-label="Loading products"` on the container provides screen reader context.
 */
export default function ProductGridSkeleton() {
  return (
    <div className="product-grid" aria-label="Loading products" role="status">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="product-card">
          <div className="product-card__image-wrap">
            <Skeleton variant="image" height="100%" />
          </div>
          <div className="product-card__info">
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="text" width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}
