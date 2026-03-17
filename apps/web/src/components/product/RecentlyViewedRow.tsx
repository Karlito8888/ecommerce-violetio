import { Component, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { useRecentlyViewed, productDetailQueryOptions, useUser } from "@ecommerce/shared";
import type { Product, ProductDetailFetchFn } from "@ecommerce/shared";
import { getProductFn } from "#/server/getProduct";
import BaseProductCard from "./BaseProductCard";

/** Adapter: wraps TanStack Start Server Function to match shared hook signature. */
const fetchProductAdapter: ProductDetailFetchFn = (id) => getProductFn({ data: id });

/**
 * Error boundary that silently hides the recently viewed section on crash.
 * Same pattern as RecommendationRow — hooks require QueryClientProvider.
 */
class RecentlyViewedBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function RecentlyViewedRowInner() {
  const { data: user } = useUser();
  const userId = user && !user.is_anonymous ? user.id : undefined;

  const {
    data: productIds,
    isLoading: idsLoading,
    isError: idsError,
  } = useRecentlyViewed({ userId });

  // Fetch live product data from Violet for each recently viewed product ID
  const productQueries = useQueries({
    queries: (productIds ?? []).map((id) => ({
      ...productDetailQueryOptions(id, fetchProductAdapter),
    })),
  });

  if (idsError) return null;

  const isLoading =
    idsLoading || (productIds && productIds.length > 0 && productQueries.some((q) => q.isLoading));

  if (isLoading) {
    return (
      <section className="recently-viewed-row" aria-label="Loading recently viewed">
        {/*
         * [H1 code-review fix] Use <h2> — not <h3>.
         * On the homepage the heading sits between the <h1> hero and the <h2>
         * feature cards. Using <h3> here broke the document outline and hurt
         * both screen-reader navigation and SEO heading hierarchy.
         */}
        <h2 className="recently-viewed-row__heading">Recently Viewed</h2>
        <div className="recently-viewed-row__grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="recently-viewed-row__skeleton" aria-hidden="true" />
          ))}
        </div>
      </section>
    );
  }

  // Build product list from successful queries, preserving recently-viewed order
  const products: Product[] = [];
  const productMap = new Map<string, Product>();
  for (const query of productQueries) {
    if (query.data?.data) {
      productMap.set(query.data.data.id, query.data.data);
    }
  }
  for (const id of productIds ?? []) {
    const product = productMap.get(id);
    if (product) products.push(product);
  }

  if (products.length === 0) return null;

  return (
    <section className="recently-viewed-row" aria-label="Recently viewed products">
      {/* [H1 code-review fix] <h2> for correct heading hierarchy — see loading state comment. */}
      <h2 className="recently-viewed-row__heading">Recently Viewed</h2>
      {/*
       * [H2 code-review fix] role="list" requires children with role="listitem".
       * Without it, assistive tech announces the container as a list but cannot
       * enumerate the items — a WCAG 2.1 SC 1.3.1 (Info and Relationships) violation.
       */}
      <div className="recently-viewed-row__grid" role="list">
        {products.map((product) => (
          <div key={product.id} className="recently-viewed-row__card" role="listitem">
            {/*
             * [L1 code-review note] Uses `product.seller` for merchantName,
             * consistent with ProductCard.tsx. RecommendationRow uses
             * `product.vendor` instead — a pre-existing inconsistency in
             * the codebase. Both are valid Product fields; `seller` is the
             * canonical merchant name from the Violet API response.
             */}
            <BaseProductCard
              id={product.id}
              name={product.name}
              merchantName={product.seller}
              thumbnailUrl={product.thumbnailUrl}
              available={product.available}
              minPrice={product.minPrice}
              currency={product.currency}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * "Recently Viewed" horizontal product row for the homepage.
 *
 * Self-contained: fetches user context, recently viewed IDs, and product details internally.
 * Silently hides on error or empty results (graceful degradation).
 * Uses BaseProductCard (with WishlistButton already integrated).
 *
 * Desktop: horizontal row of up to 6 cards.
 * Mobile breakpoint: horizontal scroll with snap points.
 *
 * ### Heading level choice (H1 code-review fix)
 * Uses `<h2>` because the homepage structure is:
 * `<h1>` hero → `<h2>` Recently Viewed → `<h2>` feature cards.
 * A `<h3>` here would break the document outline.
 */
export default function RecentlyViewedRow() {
  return (
    <RecentlyViewedBoundary>
      <RecentlyViewedRowInner />
    </RecentlyViewedBoundary>
  );
}
