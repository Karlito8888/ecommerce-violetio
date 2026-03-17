import { Link } from "@tanstack/react-router";
import type { ProductMatch, MatchExplanations } from "@ecommerce/shared";
import SearchProductCard from "./SearchProductCard";

/**
 * Props for the SearchResults display component.
 *
 * The parent (search route) passes all five props unconditionally — the
 * component's branching logic handles loading, error, empty, and populated
 * states internally. This keeps the route component simple (no nested
 * ternaries) while the display component owns all visual state transitions.
 */
interface SearchResultsProps {
  products: ProductMatch[];
  explanations: MatchExplanations;
  query: string;
  isLoading: boolean;
  error: Error | null;
  personalized?: boolean;
  personalizationHint?: string;
}

/**
 * Displays AI search results as a responsive grid with match explanations.
 *
 * ## State machine
 *
 * 1. `isLoading` → skeleton grid (8 placeholders)
 * 2. `error` → friendly error + "Browse products" CTA
 * 3. `products.length === 0 && query ≥ 2` → empty state + suggestion
 * 4. `products.length > 0` → result grid with cards and explanations
 *
 * ## Accessibility (AC9)
 *
 * - `aria-live="polite"` on the results wrapper so screen readers announce
 *   new results without interrupting the current reading flow.
 * - `role="list"` / `role="listitem"` on grid for semantic grouping.
 * - Skeleton uses `aria-busy` to signal loading to assistive tech.
 * - Error state uses `role="alert"` for immediate announcement.
 */
export default function SearchResults({
  products,
  explanations,
  query,
  isLoading,
  error,
  personalized,
  personalizationHint,
}: SearchResultsProps) {
  if (isLoading) {
    return <SearchResultsSkeleton />;
  }

  if (error) {
    return (
      <div className="search-results__error" role="alert">
        <h2 className="search-results__error-title">Something went wrong</h2>
        <p className="search-results__error-text">
          We couldn&apos;t complete your search. Please try again or browse our catalog.
        </p>
        <Link
          to="/products"
          search={{
            category: undefined,
            minPrice: undefined,
            maxPrice: undefined,
            inStock: undefined,
            sortBy: undefined,
            sortDirection: undefined,
          }}
          className="search-results__empty-cta"
        >
          Browse products
        </Link>
      </div>
    );
  }

  if (products.length === 0 && query.length >= 2) {
    return (
      <div className="search-results__empty">
        <h2 className="search-results__empty-title">No results found</h2>
        <p className="search-results__empty-text">
          We couldn&apos;t find products matching &ldquo;{query}&rdquo;.
        </p>
        <p className="search-results__empty-suggestion">
          Try: &ldquo;red dress under $50 for a summer wedding&rdquo;
        </p>
        <Link
          to="/products"
          search={{
            category: undefined,
            minPrice: undefined,
            maxPrice: undefined,
            inStock: undefined,
            sortBy: undefined,
            sortDirection: undefined,
          }}
          className="search-results__empty-cta"
        >
          Browse all products
        </Link>
      </div>
    );
  }

  return (
    <div className="search-results" aria-live="polite">
      {personalized && (
        <p className="search-results__personalization-hint">
          {personalizationHint ?? "Results tailored to your preferences"}
        </p>
      )}
      <div className="search-results__grid" role="list">
        {products.map((product) => (
          <div key={product.id} className="search-results__item">
            <SearchProductCard product={product} />
            {explanations[product.id] && (
              <p className="search-results__explanation">{explanations[product.id]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchResultsSkeleton() {
  return (
    <div className="search-results__skeleton" aria-busy="true" aria-label="Loading search results">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="search-results__skeleton-card">
          <div className="skeleton search-results__skeleton-image" />
          <div className="skeleton search-results__skeleton-text" style={{ width: "80%" }} />
          <div className="skeleton search-results__skeleton-text" style={{ width: "50%" }} />
          <div className="skeleton search-results__skeleton-text" style={{ width: "30%" }} />
        </div>
      ))}
    </div>
  );
}

export { SearchResultsSkeleton };
