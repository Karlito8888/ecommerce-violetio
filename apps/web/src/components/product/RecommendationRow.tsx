import { Component, type ReactNode } from "react";
import { useRecommendations, useUser } from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "#/utils/supabase";
import BaseProductCard from "./BaseProductCard";

/**
 * Error boundary that silently hides the recommendations section on crash.
 *
 * RecommendationRow uses hooks (useUser, useRecommendations) that require
 * QueryClientProvider. In test environments without providers, React would
 * crash. This boundary catches those errors and renders nothing.
 */
class RecommendationBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/**
 * Inner component that uses hooks — wrapped by RecommendationBoundary.
 */
function RecommendationRowInner({ productId }: { productId: string }) {
  const supabase = getSupabaseBrowserClient();
  const { data: user } = useUser();
  const userId = user && !user.is_anonymous ? user.id : undefined;

  const { data, isLoading, isError } = useRecommendations(productId, supabase, userId);

  if (isError) return null;

  if (isLoading) {
    return (
      <section className="recommendation-row" aria-label="Loading recommendations">
        <h3 className="recommendation-row__heading">You might also like</h3>
        <div className="recommendation-row__grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="recommendation-row__skeleton" aria-hidden="true" />
          ))}
        </div>
      </section>
    );
  }

  if (!data || data.products.length === 0) return null;

  return (
    <section className="recommendation-row" aria-label="Product recommendations">
      <h3 className="recommendation-row__heading">You might also like</h3>
      {/**
       * M10 review fix: Added role="listitem" on grid children.
       *
       * The container has role="list" but children were missing role="listitem",
       * which is an ARIA violation (screen readers announce a list but can't
       * enumerate items). RecentlyViewedRow already had this correct.
       */}
      <div className="recommendation-row__grid" role="list">
        {data.products.map((product) => (
          <div key={product.id} className="recommendation-row__card" role="listitem">
            <BaseProductCard
              id={product.id}
              name={product.name}
              merchantName={product.vendor}
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
 * "You might also like" recommendation section for product detail pages.
 *
 * Loads asynchronously via useRecommendations() — does NOT block product page render.
 * Silently hides on error or empty results (graceful degradation).
 * Uses BaseProductCard (with WishlistButton already integrated).
 *
 * Desktop: horizontal row of up to 4 cards.
 * Mobile breakpoint: horizontal scroll with snap points.
 */
export default function RecommendationRow({ productId }: { productId: string }) {
  return (
    <RecommendationBoundary>
      <RecommendationRowInner productId={productId} />
    </RecommendationBoundary>
  );
}
