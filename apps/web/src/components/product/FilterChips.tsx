import "./FilterChips.css";

/**
 * Active filter state managed by the parent (product listing page).
 * All price values are integer cents matching Violet API convention.
 */
export interface ActiveFilters {
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
}

/**
 * A predefined filter option rendered as a chip.
 *
 * ## Filter chip categories
 *
 * - **Price range chips** — mutually exclusive (selecting one deselects others).
 *   Each maps to a `minPrice`/`maxPrice` range in integer cents.
 * - **Availability chip** ("In Stock") — can be combined with any price chip.
 * - **"All" chip** — clears all active filters. Always rendered first.
 *
 * ## Why predefined chips (not dynamic ranges)?
 *
 * The UX spec mandates a maximum of 5–6 filter chips with fixed thresholds.
 * Dynamic faceted filtering is an anti-pattern for this MVP — the AI search
 * feature (Story 3.5) handles the long tail of complex queries.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
 */
interface FilterOption {
  /** Unique identifier for React key and matching logic. */
  id: string;
  /** Display text shown in the chip. */
  label: string;
  /** Filter values applied when this chip is active. `null` = "All" (clear filters). */
  filter: Omit<ActiveFilters, "inStock"> | null;
  /** Whether this is the availability toggle (not a price chip). */
  isAvailability?: boolean;
}

/**
 * Predefined filter options.
 *
 * Price thresholds are in integer cents (Violet API convention):
 * - "Under $50"  → max_price: 5000
 * - "Under $100" → max_price: 10000
 * - "$100–$200"  → min_price: 10000, max_price: 20000
 * - "$200+"      → min_price: 20000
 */
const FILTER_OPTIONS: FilterOption[] = [
  { id: "all", label: "All", filter: null },
  { id: "under-50", label: "Under $50", filter: { maxPrice: 5000 } },
  { id: "under-100", label: "Under $100", filter: { maxPrice: 10000 } },
  { id: "100-200", label: "$100–$200", filter: { minPrice: 10000, maxPrice: 20000 } },
  { id: "200-plus", label: "$200+", filter: { minPrice: 20000 } },
  { id: "in-stock", label: "In Stock", filter: {}, isAvailability: true },
];

interface FilterChipsProps {
  /** Current active filter state from URL search params. */
  activeFilters: ActiveFilters;
  /**
   * Callback when user clicks a filter chip.
   * Parent is responsible for updating URL search params via `navigate({ search })`.
   */
  onFilterChange: (filters: ActiveFilters) => void;
}

/**
 * Horizontal scrollable chip bar for price and availability filtering.
 *
 * ## Multi-select rules
 *
 * - **Price chips are mutually exclusive**: selecting "Under $50" deselects "$100–$200".
 * - **"In Stock" can combine with any price chip**: e.g., "Under $50" + "In Stock".
 * - **"All" clears everything**: resets both price and availability filters.
 *
 * ## How active state is determined
 *
 * Each chip checks if the current `activeFilters` match its filter definition.
 * For price chips: both `minPrice` and `maxPrice` must match exactly.
 * For "In Stock": `inStock === true`.
 * For "All": no price or availability filters are active.
 *
 * ## Semantic HTML choice: `<fieldset>` over `<div role="group">`
 *
 * Uses a native `<fieldset>` with a visually-hidden `<legend>` instead of
 * `<div role="group">`. This provides better screen reader support (NVDA/JAWS
 * announce fieldset groupings more consistently) and aligns with WAI-ARIA
 * guidance for toggle button groups.
 *
 * CategoryChips uses `<nav>` because categories are navigation links (they
 * change the page content context). FilterChips uses `<fieldset>` because
 * filters are form controls (they narrow existing content without navigating).
 *
 * @see CategoryChips — sister component using `<nav>` for category navigation
 */
export default function FilterChips({ activeFilters, onFilterChange }: FilterChipsProps) {
  const hasAnyFilter =
    activeFilters.minPrice !== undefined ||
    activeFilters.maxPrice !== undefined ||
    activeFilters.inStock === true;

  /**
   * Determines if a filter option matches the current active state.
   */
  function isActive(option: FilterOption): boolean {
    if (option.id === "all") return !hasAnyFilter;
    if (option.isAvailability) return activeFilters.inStock === true;
    // Price chip: both minPrice and maxPrice must match exactly
    return (
      activeFilters.minPrice === option.filter?.minPrice &&
      activeFilters.maxPrice === option.filter?.maxPrice
    );
  }

  /**
   * Handles chip click with multi-select logic.
   *
   * - "All" → clears everything
   * - Price chip → replaces current price filter, preserves inStock
   * - "In Stock" → toggles availability, preserves price filter
   */
  function handleClick(option: FilterOption) {
    if (option.id === "all") {
      onFilterChange({});
      return;
    }

    if (option.isAvailability) {
      // Toggle inStock, preserve price filters
      onFilterChange({
        minPrice: activeFilters.minPrice,
        maxPrice: activeFilters.maxPrice,
        inStock: activeFilters.inStock ? undefined : true,
      });
      return;
    }

    // Price chip — toggle: if already active, deselect (show all prices)
    const alreadyActive = isActive(option);
    onFilterChange({
      minPrice: alreadyActive ? undefined : option.filter?.minPrice,
      maxPrice: alreadyActive ? undefined : option.filter?.maxPrice,
      inStock: activeFilters.inStock,
    });
  }

  return (
    <fieldset className="chip-bar filter-chips" aria-label="Filter options">
      {/**
       * Visually hidden legend for screen readers.
       * Provides context that this is a filter group, not navigation.
       * Uses the existing `.sr-only` utility class from utilities.css.
       */}
      <legend className="sr-only">Filter options</legend>
      <div className="chip-bar__list">
        {FILTER_OPTIONS.map((option) => {
          const active = isActive(option);
          return (
            <button
              key={option.id}
              type="button"
              className={`chip-bar__item${active ? " chip-bar__item--active" : ""}`}
              aria-pressed={active}
              onClick={() => handleClick(option)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
