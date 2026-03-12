import type { CategoryItem } from "../../server/getProducts";

import "./CategoryChips.css";

interface CategoryChipsProps {
  /**
   * Category list to render as chips.
   *
   * Fetched from Violet's `GET /catalog/categories` via `getCategoriesFn`,
   * with automatic fallback to FALLBACK_CATEGORIES when the API returns empty.
   * Passed from the route loader — NOT hardcoded in this component.
   *
   * ## Why categories come from props (not hardcoded)
   *
   * Original implementation hardcoded FALLBACK_CATEGORIES directly in this
   * component, making it impossible to show real Violet categories even when
   * the API returned data. Moving category fetching to the route loader
   * (via getCategoriesFn) allows SSR prefetching and real API data.
   */
  categories: CategoryItem[];

  /** Currently active category filter, or `undefined` for "All" */
  activeCategory: string | undefined;

  /** Callback when user selects a category chip */
  onCategoryChange: (category: string | undefined) => void;
}

/**
 * Horizontal scrollable chip bar for category filtering.
 *
 * Design (from UX spec):
 * - Active chip: `--color-midnight` bg, white text
 * - Inactive chip: outlined with subtle border
 * - "All" chip is always first (clears category filter)
 * - Fade gradient at horizontal scroll edges (CSS pseudo-elements)
 * - Max 5-6 top-level categories displayed
 *
 * Category selection updates URL `?category=` via parent's navigate call,
 * making category state shareable and bookmarkable.
 *
 * Accessibility: each chip is a `<button>` with `aria-pressed` for toggle state,
 * wrapped in a `<nav>` with `aria-label` for screen reader context.
 *
 * @see https://docs.violet.io/api-reference/catalog/categories/get-categories
 */
export default function CategoryChips({
  categories,
  activeCategory,
  onCategoryChange,
}: CategoryChipsProps) {
  return (
    <nav className="category-chips" aria-label="Product categories">
      <div className="category-chips__list">
        {categories.map(({ slug, label, filter }) => {
          const isActive = activeCategory === filter || (slug === "all" && !activeCategory);
          return (
            <button
              key={slug}
              type="button"
              className={`category-chips__item${isActive ? " category-chips__item--active" : ""}`}
              aria-pressed={isActive}
              onClick={() => onCategoryChange(filter)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
