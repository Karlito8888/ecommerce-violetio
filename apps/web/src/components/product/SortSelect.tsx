import type { ChangeEvent } from "react";

import "./SortSelect.css";

interface SortSelectProps {
  /** Current sort field, or `undefined` for relevance (default). */
  sortBy?: "relevance" | "price";
  /** Current sort direction. Only meaningful when `sortBy === "price"`. */
  sortDirection?: "ASC" | "DESC";
  /**
   * Callback when user changes sort selection.
   * `sortBy: undefined` means "Relevance" (no explicit sort — Violet default).
   */
  onSortChange: (sortBy: "relevance" | "price" | undefined, sortDirection?: "ASC" | "DESC") => void;
}

/**
 * Sort options encoded as `value` strings for the native `<select>`.
 *
 * Each value encodes both `sortBy` and `sortDirection` as a single string,
 * parsed back in `handleChange`. This avoids needing two separate controls.
 *
 * "Relevance" maps to `sortBy: undefined` — omitting sort params tells Violet
 * to return results in its default relevance order.
 */
const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
] as const;

/**
 * Minimal sort dropdown using a native `<select>` element.
 *
 * ## Why native `<select>` (not a custom dropdown)?
 *
 * - Accessible out of the box (keyboard nav, screen readers, mobile pickers)
 * - No additional dependency needed
 * - Sort is single-value (unlike filters which are multi-select chips)
 * - Per UX spec: "minimal" dropdown, not a chip bar
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/search-offers — sort_by / sort_direction
 */
export default function SortSelect({ sortBy, sortDirection, onSortChange }: SortSelectProps) {
  /**
   * Derive the current `<select>` value from props.
   * Encodes sortBy + sortDirection into a single string for the select value.
   */
  function currentValue(): string {
    if (sortBy === "price") {
      return sortDirection === "DESC" ? "price-desc" : "price-asc";
    }
    return "relevance";
  }

  /**
   * Parse the select value back into `sortBy` + `sortDirection` and notify parent.
   */
  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === "price-asc") {
      onSortChange("price", "ASC");
    } else if (val === "price-desc") {
      onSortChange("price", "DESC");
    } else {
      onSortChange(undefined, undefined);
    }
  }

  return (
    <div className="sort-select">
      <label className="sort-select__label" htmlFor="sort-select">
        Sort by
      </label>
      <select
        id="sort-select"
        className="sort-select__dropdown"
        value={currentValue()}
        onChange={handleChange}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
