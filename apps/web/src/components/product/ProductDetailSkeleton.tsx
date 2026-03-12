import Skeleton from "../Skeleton";

/**
 * Skeleton loading state for the product detail page.
 *
 * Matches the two-column layout of ProductDetail:
 * - Left: large image skeleton (3:4 aspect ratio)
 * - Right: text lines for merchant, name, price, button
 *
 * Reuses the `product-detail` grid class for consistent layout.
 */
export default function ProductDetailSkeleton() {
  return (
    <div className="page-wrap">
      <div className="product-detail" role="status" aria-label="Loading product">
        <div className="product-detail__gallery">
          <Skeleton variant="image" height="480px" />
        </div>
        <div className="product-detail__info">
          <Skeleton variant="text" width="30%" />
          <Skeleton variant="text" width="70%" height="2rem" />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="100%" height="3rem" />
          <Skeleton variant="text" width="80%" />
        </div>
      </div>
    </div>
  );
}
