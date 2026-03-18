import type { ContentType } from "@ecommerce/shared";

/** Available content type filters with display labels. */
const TYPE_OPTIONS: Array<{ value: ContentType | undefined; label: string }> = [
  { value: undefined, label: "All" },
  { value: "guide", label: "Guides" },
  { value: "comparison", label: "Comparisons" },
  { value: "review", label: "Reviews" },
];

interface ContentTypeFilterProps {
  activeType: ContentType | undefined;
  onTypeChange: (type: ContentType | undefined) => void;
}

/**
 * Horizontal chip row for filtering content by type.
 *
 * Renders "All", "Guides", "Comparisons", "Reviews" chips. Active chip
 * is visually highlighted. Uses the `.chip` base class extended with
 * content-list-specific modifiers.
 */
export default function ContentTypeFilter({ activeType, onTypeChange }: ContentTypeFilterProps) {
  return (
    <div className="content-list__filters" role="group" aria-label="Filter by content type">
      {TYPE_OPTIONS.map(({ value, label }) => {
        const isActive = activeType === value;
        return (
          <button
            key={label}
            type="button"
            className={`chip content-list__filter-chip ${isActive ? "content-list__filter-chip--active" : ""}`}
            onClick={() => onTypeChange(value)}
            aria-pressed={isActive}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
