import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Rotating example queries for the hero search bar placeholder.
 * Cycles every 4 s via setInterval (hero variant only).
 */
const EXAMPLE_QUERIES = [
  "gift for my dad who likes cooking",
  "red dress under $50",
  "running shoes for beginners",
  "cozy blanket for winter",
  "sustainable home decor",
];

/** Static trending suggestions shown below the hero search bar. */
const TRENDING_SUGGESTIONS = ["summer dresses", "running shoes", "gifts"];

interface SearchBarProps {
  variant?: "compact" | "hero";
  initialQuery?: string;
  /**
   * When true, the input is focused on mount.
   *
   * **Why this exists (H2 code-review fix):**
   * AC9 requires "auto-focus search input on /search page load" so keyboard
   * users can start typing immediately without a manual click. Only the
   * search results page sets this — the header compact variant must NOT
   * auto-focus or it would steal focus on every navigation.
   */
  autoFocus?: boolean;
}

/**
 * Unified search bar used in two contexts:
 *
 * - `variant="compact"` — header-integrated, max-width 400 px, Inter font
 * - `variant="hero"` — full-width homepage, Cormorant font, animated placeholder
 *
 * ## Keyboard navigation (AC9 — WCAG 2.1 AA)
 *
 * - **Enter** submits the form (≥ 2 chars)
 * - **Escape** clears input + blurs
 * - **ArrowDown** moves focus from input → first trending suggestion (hero only)
 * - **ArrowDown / ArrowUp** cycle through suggestion buttons
 * - **ArrowUp** on first suggestion returns focus to input
 *
 * Arrow-key navigation was added during code review (H1 fix) to satisfy AC9's
 * explicit requirement: "Arrow keys navigate suggestions".
 */
export default function SearchBar({
  variant = "compact",
  initialQuery = "",
  autoFocus = false,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const navigate = useNavigate();

  const isHero = variant === "hero";

  /** H2 fix — auto-focus on mount when requested (search results page). */
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (!isHero) return;
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_QUERIES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isHero]);

  const placeholder = isHero ? EXAMPLE_QUERIES[placeholderIndex] : "What are you looking for?";

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed.length < 2) return;
      navigate({
        to: "/search",
        search: {
          q: trimmed,
          category: undefined,
          minPrice: undefined,
          maxPrice: undefined,
          inStock: undefined,
        },
      });
    },
    [query, navigate],
  );

  /**
   * Keyboard handler on the search input.
   *
   * **H1 code-review fix — ArrowDown into suggestions:**
   * When the hero variant has visible suggestions, ArrowDown moves focus
   * to the first suggestion button. This fulfils AC9's arrow-key navigation
   * requirement and follows the WAI combobox pattern for suggestion lists.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setQuery("");
        inputRef.current?.blur();
      }
      if (e.key === "ArrowDown" && isHero && suggestionsRef.current.length > 0) {
        e.preventDefault();
        suggestionsRef.current[0]?.focus();
      }
    },
    [isHero],
  );

  /**
   * Keyboard handler on individual suggestion buttons.
   *
   * **H1 code-review fix — full arrow-key cycle:**
   * - ArrowDown → next suggestion
   * - ArrowUp → previous suggestion (or back to input if on first)
   * - Enter already works natively (button click)
   */
  const handleSuggestionKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    const total = suggestionsRef.current.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (index < total - 1) {
        suggestionsRef.current[index + 1]?.focus();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index > 0) {
        suggestionsRef.current[index - 1]?.focus();
      } else {
        inputRef.current?.focus();
      }
    }
  }, []);

  const handleClear = useCallback(() => {
    setQuery("");
    inputRef.current?.focus();
  }, []);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setQuery(suggestion);
      navigate({
        to: "/search",
        search: {
          q: suggestion,
          category: undefined,
          minPrice: undefined,
          maxPrice: undefined,
          inStock: undefined,
        },
      });
    },
    [navigate],
  );

  return (
    <div className={`search-bar search-bar--${variant}`}>
      <form role="search" className="search-bar__form" onSubmit={handleSubmit}>
        <span className="search-bar__icon" aria-hidden="true">
          <svg
            viewBox="0 0 20 20"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="search"
          className="search-bar__input"
          placeholder={placeholder}
          aria-label="Search products"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {query.length > 0 && (
          <button
            type="button"
            className="search-bar__clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <svg
              viewBox="0 0 20 20"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        )}
      </form>

      {isHero && (
        <div className="search-bar__suggestions" role="group" aria-label="Trending searches">
          <span className="search-bar__suggestions-label">Trending:</span>
          {TRENDING_SUGGESTIONS.map((s, i) => (
            <button
              key={s}
              ref={(el) => {
                suggestionsRef.current[i] = el;
              }}
              type="button"
              className="search-bar__suggestion"
              onClick={() => handleSuggestionClick(s)}
              onKeyDown={(e) => handleSuggestionKeyDown(e, i)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
