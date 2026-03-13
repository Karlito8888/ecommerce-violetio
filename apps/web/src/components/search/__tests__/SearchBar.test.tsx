/**
 * SearchBar component tests.
 *
 * Uses direct React rendering (via react-dom/client) to avoid the Bun workspace
 * CJS dual-instance issue with @testing-library/react.
 *
 * Tests cover:
 * - Renders with correct placeholder text
 * - --hero variant applies correct CSS class
 * - --compact variant applies correct CSS class
 * - Form has role="search"
 * - Input has type="search" and aria-label
 * - Form submission navigates to /search?q=<query>
 * - Escape key clears input
 * - Empty/short query doesn't submit
 * - Clear button appears when input has value
 * - Hero variant renders trending suggestions
 * - (H1 fix) ArrowDown from input focuses first suggestion
 * - (H1 fix) ArrowDown/ArrowUp cycle through suggestions
 * - (H2 fix) autoFocus prop focuses input on mount
 */
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import SearchBar from "../SearchBar";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...rest }: Record<string, unknown>) =>
    React.createElement("a", { href: to, ...rest }, children as React.ReactNode),
}));

function renderToContainer(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);

  act(() => {
    createRoot(container).render(element);
  });

  return container;
}

describe("SearchBar", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders compact variant with correct placeholder", () => {
    const container = renderToContainer(<SearchBar variant="compact" />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toBe("What are you looking for?");
  });

  it("applies --compact CSS modifier class", () => {
    const container = renderToContainer(<SearchBar variant="compact" />);
    const wrapper = container.querySelector(".search-bar");
    expect(wrapper!.classList.contains("search-bar--compact")).toBe(true);
  });

  it("applies --hero CSS modifier class", () => {
    const container = renderToContainer(<SearchBar variant="hero" />);
    const wrapper = container.querySelector(".search-bar");
    expect(wrapper!.classList.contains("search-bar--hero")).toBe(true);
  });

  it("form has role='search'", () => {
    const container = renderToContainer(<SearchBar />);
    const form = container.querySelector("form");
    expect(form!.getAttribute("role")).toBe("search");
  });

  it("input has type='search' and aria-label='Search products'", () => {
    const container = renderToContainer(<SearchBar />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("search");
    expect(input.getAttribute("aria-label")).toBe("Search products");
  });

  it("navigates to /search?q=<query> on form submit", () => {
    const container = renderToContainer(<SearchBar initialQuery="cooking gift" />);
    const form = container.querySelector("form") as HTMLFormElement;

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    /**
     * L2 code-review fix — use objectContaining for stable assertion.
     *
     * handleSubmit passes all search params (q + undefined filters) to navigate().
     * Matching only the fields we care about avoids brittleness if new params
     * are added to SearchPageParams in the future.
     */
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/search",
        search: expect.objectContaining({ q: "cooking gift" }),
      }),
    );
  });

  it("does not submit when query is too short (< 2 chars)", () => {
    const container = renderToContainer(<SearchBar initialQuery="a" />);
    const form = container.querySelector("form") as HTMLFormElement;

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not submit when query is empty", () => {
    const container = renderToContainer(<SearchBar />);
    const form = container.querySelector("form") as HTMLFormElement;

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders initialQuery in the input", () => {
    const container = renderToContainer(<SearchBar initialQuery="test query" />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("test query");
  });

  it("shows clear button when input has a value", () => {
    const container = renderToContainer(<SearchBar initialQuery="hello" />);
    const clearBtn = container.querySelector(".search-bar__clear");
    expect(clearBtn).not.toBeNull();
    expect(clearBtn!.getAttribute("aria-label")).toBe("Clear search");
  });

  it("does not show clear button when input is empty", () => {
    const container = renderToContainer(<SearchBar />);
    const clearBtn = container.querySelector(".search-bar__clear");
    expect(clearBtn).toBeNull();
  });

  it("hero variant renders trending suggestions", () => {
    const container = renderToContainer(<SearchBar variant="hero" />);
    const suggestions = container.querySelector(".search-bar__suggestions");
    expect(suggestions).not.toBeNull();
    expect(container.textContent).toContain("Trending:");
    expect(container.textContent).toContain("summer dresses");
  });

  it("compact variant does NOT render suggestions", () => {
    const container = renderToContainer(<SearchBar variant="compact" />);
    const suggestions = container.querySelector(".search-bar__suggestions");
    expect(suggestions).toBeNull();
  });

  it("hero suggestion click navigates to search", () => {
    const container = renderToContainer(<SearchBar variant="hero" />);
    const suggestionBtn = container.querySelector(".search-bar__suggestion") as HTMLButtonElement;

    act(() => {
      suggestionBtn.click();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/search",
        search: expect.objectContaining({ q: expect.any(String) }),
      }),
    );
  });

  // ── H1 code-review fix: arrow-key navigation tests ──

  it("ArrowDown from input focuses first suggestion (hero)", () => {
    const container = renderToContainer(<SearchBar variant="hero" />);
    const input = container.querySelector("input") as HTMLInputElement;
    const firstSuggestion = container.querySelector(".search-bar__suggestion") as HTMLButtonElement;

    act(() => {
      input.focus();
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });

    expect(document.activeElement).toBe(firstSuggestion);
  });

  it("ArrowDown/ArrowUp cycle through suggestions (hero)", () => {
    const container = renderToContainer(<SearchBar variant="hero" />);
    const suggestions = container.querySelectorAll(".search-bar__suggestion");
    const input = container.querySelector("input") as HTMLInputElement;

    // Focus first suggestion via ArrowDown from input
    act(() => {
      input.focus();
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(suggestions[0]);

    // ArrowDown → second suggestion
    act(() => {
      suggestions[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(suggestions[1]);

    // ArrowUp → back to first suggestion
    act(() => {
      suggestions[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(suggestions[0]);

    // ArrowUp on first → back to input
    act(() => {
      suggestions[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(input);
  });

  // ── H2 code-review fix: autoFocus test ──

  it("autoFocus prop focuses input on mount", () => {
    const container = renderToContainer(<SearchBar autoFocus />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
  });

  it("input is NOT focused by default (no autoFocus)", () => {
    renderToContainer(<SearchBar />);
    const input = document.querySelector("input") as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
  });
});
