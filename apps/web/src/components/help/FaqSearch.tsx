interface FaqSearchProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Search input for filtering FAQ items.
 * Client-side only — no server round-trip.
 */
export default function FaqSearch({ value, onChange }: FaqSearchProps) {
  return (
    <div className="faq-search">
      <SearchIcon />
      <input
        type="search"
        className="faq-search__input"
        placeholder="Search frequently asked questions…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search FAQ"
      />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="faq-search__icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M13 13L17 17" />
    </svg>
  );
}
