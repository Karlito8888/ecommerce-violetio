import { Link } from "@tanstack/react-router";
import type { Product } from "@ecommerce/shared";
import { formatPrice } from "@ecommerce/shared";

import "./ProductCard.css";

/**
 * Product card component for the catalog grid.
 *
 * Anatomy (from UX spec):
 * ```
 * ┌─────────────────────────────────┐
 * │        [Product Image]          │
 * │          (3:4 ratio)            │
 * ├─────────────────────────────────┤
 * │  Product Name (serif)           │
 * │  Merchant Name                  │
 * │  $129.00                        │
 * └─────────────────────────────────┘
 * ```
 *
 * States:
 * - **Default**: image, name, merchant, price
 * - **Hover** (web): image zoom scale(1.02) over 400ms, shadow-md appears
 * - **Out of stock**: image desaturated 50%, "Sold Out" overlay badge
 * - **No image**: placeholder SVG when `thumbnailUrl` is null
 *
 * Accessibility:
 * - `<article>` with `aria-label="[Product Name], [Price]"`
 * - Image `alt="[Name] by [Merchant]"`
 *
 * Links to `/products/$productId` via TanStack Router `<Link>` for client-side
 * navigation with intent-based preloading (configured in router.tsx).
 *
 * @see https://docs.violet.io/prism/catalog/media-transformations — image CDN URLs
 */
export default function ProductCard({ product }: { product: Product }) {
  const isOutOfStock = !product.available;
  const priceDisplay = formatPrice(product.minPrice, product.currency);
  const imageAlt = `${product.name} by ${product.seller}`;

  return (
    <article
      className={`product-card${isOutOfStock ? " product-card--out-of-stock" : ""}`}
      aria-label={`${product.name}, ${priceDisplay}`}
    >
      <Link
        to="/products/$productId"
        params={{ productId: product.id }}
        className="product-card__link"
      >
        <div className="product-card__image-wrap">
          {product.thumbnailUrl ? (
            <img
              src={product.thumbnailUrl}
              alt={imageAlt}
              className="product-card__image"
              loading="lazy"
            />
          ) : (
            <div className="product-card__placeholder" role="img" aria-label={imageAlt}>
              <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <rect width="48" height="48" rx="4" fill="var(--color-sand)" />
                <path d="M14 34l8-10 6 7 4-5 6 8H14z" fill="var(--color-stone)" />
                <circle cx="18" cy="18" r="3" fill="var(--color-stone)" />
              </svg>
            </div>
          )}
          {isOutOfStock && <span className="product-card__badge">Sold Out</span>}
        </div>

        <div className="product-card__info">
          <h3 className="product-card__name">{product.name}</h3>
          <p className="product-card__merchant">{product.seller}</p>
          <p className="product-card__price">{priceDisplay}</p>
        </div>
      </Link>
    </article>
  );
}
