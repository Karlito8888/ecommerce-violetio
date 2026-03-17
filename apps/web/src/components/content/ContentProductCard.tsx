import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { productDetailQueryOptions, formatPrice } from "@ecommerce/shared";
import type { ProductDetailFetchFn } from "@ecommerce/shared";
import { getProductFn } from "../../server/getProduct";

interface ContentProductCardProps {
  productId: string;
}

/**
 * Adapter: bridges TanStack Start server function to shared ProductDetailFetchFn.
 */
const fetchProduct: ProductDetailFetchFn = (id) => getProductFn({ data: id });

/**
 * Inline product card rendered within editorial content.
 * Fetches live product data from the Violet.io API via the existing
 * getProductFn Server Function — same data pipeline as product detail pages.
 *
 * Differs from BaseProductCard: horizontal layout optimized for editorial context,
 * includes a CTA button, and is designed to sit inline with article text.
 *
 * ## BEM: .content-product-card
 */
export default function ContentProductCard({ productId }: ContentProductCardProps) {
  const { data, isLoading, isError } = useQuery(productDetailQueryOptions(productId, fetchProduct));

  if (isLoading) {
    return (
      <div className="content-product-card content-product-card--loading" aria-busy="true">
        <div className="content-product-card__skeleton-image" />
        <div className="content-product-card__skeleton-info">
          <div className="content-product-card__skeleton-line" />
          <div className="content-product-card__skeleton-line content-product-card__skeleton-line--short" />
        </div>
      </div>
    );
  }

  const product = data?.data ?? null;

  if (isError || !product) {
    return (
      <div className="content-product-card content-product-card--error">
        <p>
          Product unavailable —{" "}
          <Link to="/products/$productId" params={{ productId }}>
            View product
          </Link>
        </p>
      </div>
    );
  }

  const priceDisplay = formatPrice(product.minPrice, product.currency);
  const thumbnailUrl = product.thumbnailUrl;

  return (
    <div className="content-product-card">
      <Link
        to="/products/$productId"
        params={{ productId: product.id }}
        className="content-product-card__link"
      >
        <div className="content-product-card__image">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={product.name} loading="lazy" />
          ) : (
            <div className="content-product-card__placeholder" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="4" fill="var(--color-sand)" />
                <path d="M14 34l8-10 6 7 4-5 6 8H14z" fill="var(--color-stone)" />
                <circle cx="18" cy="18" r="3" fill="var(--color-stone)" />
              </svg>
            </div>
          )}
        </div>
        <div className="content-product-card__info">
          <h3 className="content-product-card__name">{product.name}</h3>
          <p className="content-product-card__merchant">{product.seller}</p>
          <p className="content-product-card__price">{priceDisplay}</p>
          {!product.available && <span className="content-product-card__badge">Sold Out</span>}
        </div>
        <span className="content-product-card__cta">View Product</span>
      </Link>
    </div>
  );
}
