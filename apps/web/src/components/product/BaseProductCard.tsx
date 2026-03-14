import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatPrice } from "@ecommerce/shared";

/**
 * Minimal props interface for the base product card.
 *
 * Epic 3 Review — Fix S2: Extracted shared card markup.
 *
 * Both `Product` (catalog API, ~25 fields) and `ProductMatch` (search API, ~11 fields)
 * share a common subset needed for card rendering. Instead of accepting the full types
 * and lying about field presence, this interface declares only what the card actually uses.
 *
 * This avoids the previous duplication where ProductCard and SearchProductCard had
 * identical JSX but different type constraints. Now both delegate to BaseProductCard
 * with a thin adapter that maps `seller` or `vendor` to `merchantName`.
 *
 * @see ProductCard — catalog listing cards (uses `product.seller`)
 * @see SearchProductCard — search result cards (uses `product.vendor`)
 */
export interface BaseProductCardProps {
  id: string;
  name: string;
  merchantName: string;
  thumbnailUrl: string | null;
  available: boolean;
  minPrice: number;
  currency: string;
}

/**
 * Shared product card markup used by both ProductCard and SearchProductCard.
 *
 * Renders: image (with placeholder fallback), sold-out badge, name, merchant, price.
 * Wrapped in an `<article>` with `<Link>` for accessible, preloadable navigation.
 *
 * ## BEM classes (shared with ProductCard.css)
 * - `.product-card` — card container
 * - `.product-card__image-wrap` — image container (3:4 aspect ratio)
 * - `.product-card__placeholder` — SVG placeholder when no image
 * - `.product-card__badge` — "Sold Out" overlay
 * - `.product-card__info` — text content section
 * - `.product-card__name` — product name (h2 for proper heading hierarchy)
 * - `.product-card__merchant` — merchant name
 * - `.product-card__price` — formatted price
 */
export default function BaseProductCard({
  id,
  name,
  merchantName,
  thumbnailUrl,
  available,
  minPrice,
  currency,
}: BaseProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const isOutOfStock = !available;
  const priceDisplay = formatPrice(minPrice, currency);
  const imageAlt = `${name} by ${merchantName}`;

  if (imageError) return null;

  return (
    <article
      role="listitem"
      className={`product-card${isOutOfStock ? " product-card--out-of-stock" : ""}`}
      aria-label={`${name}, ${priceDisplay}`}
    >
      <Link to="/products/$productId" params={{ productId: id }} className="product-card__link">
        <div className="product-card__image-wrap">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={imageAlt}
              className="product-card__image"
              loading="lazy"
              onError={() => setImageError(true)}
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
          <h2 className="product-card__name">{name}</h2>
          <p className="product-card__merchant">{merchantName}</p>
          <p className="product-card__price">{priceDisplay}</p>
        </div>
      </Link>
    </article>
  );
}
