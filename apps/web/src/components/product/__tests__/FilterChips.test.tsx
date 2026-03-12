/**
 * FilterChips component tests.
 *
 * Uses direct React rendering (via react-dom/client) to match the project's
 * test pattern (avoids Bun workspace CJS dual-instance issue with @testing-library/react).
 *
 * Tests cover:
 * - Renders all predefined filter options (All, Under $50, Under $100, $100–$200, $200+, In Stock)
 * - Clicking "Under $50" triggers onFilterChange with { maxPrice: 5000 }
 * - Clicking "All" clears all filters
 * - Active chip has chip-bar__item--active class
 * - Price chips are mutually exclusive
 * - "In Stock" can combine with price chips
 * - Accessibility: role="group", aria-pressed toggles
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import FilterChips from "../FilterChips";
import type { ActiveFilters } from "../FilterChips";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function renderFilterChips(activeFilters: ActiveFilters, onFilterChange = vi.fn()) {
  act(() => {
    root.render(<FilterChips activeFilters={activeFilters} onFilterChange={onFilterChange} />);
  });
  return onFilterChange;
}

function getChips(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(".chip-bar__item"));
}

function getChipByLabel(label: string): HTMLButtonElement | undefined {
  return getChips().find((btn) => btn.textContent === label);
}

describe("FilterChips", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders all predefined filter options", () => {
    renderFilterChips({});
    const chips = getChips();
    expect(chips.length).toBe(6);
    expect(chips.map((c) => c.textContent)).toEqual([
      "All",
      "Under $50",
      "Under $100",
      "$100–$200",
      "$200+",
      "In Stock",
    ]);
  });

  it("has fieldset with aria-label and visually hidden legend", () => {
    renderFilterChips({});
    const fieldset = container.querySelector("fieldset");
    expect(fieldset).not.toBeNull();
    expect(fieldset?.getAttribute("aria-label")).toBe("Filter options");
    const legend = fieldset?.querySelector("legend");
    expect(legend).not.toBeNull();
    expect(legend?.textContent).toBe("Filter options");
  });

  it('"All" chip is active when no filters applied', () => {
    renderFilterChips({});
    const allChip = getChipByLabel("All")!;
    expect(allChip.classList.contains("chip-bar__item--active")).toBe(true);
    expect(allChip.getAttribute("aria-pressed")).toBe("true");
  });

  it('clicking "Under $50" triggers onFilterChange with { maxPrice: 5000 }', () => {
    const onChange = vi.fn();
    renderFilterChips({}, onChange);
    act(() => {
      getChipByLabel("Under $50")!.click();
    });
    expect(onChange).toHaveBeenCalledWith({
      maxPrice: 5000,
      minPrice: undefined,
      inStock: undefined,
    });
  });

  it('clicking "All" clears all filters', () => {
    const onChange = vi.fn();
    renderFilterChips({ maxPrice: 5000, inStock: true }, onChange);
    act(() => {
      getChipByLabel("All")!.click();
    });
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("active chip has --active modifier class", () => {
    renderFilterChips({ maxPrice: 5000 });
    const under50 = getChipByLabel("Under $50")!;
    expect(under50.classList.contains("chip-bar__item--active")).toBe(true);
    expect(under50.getAttribute("aria-pressed")).toBe("true");

    const allChip = getChipByLabel("All")!;
    expect(allChip.classList.contains("chip-bar__item--active")).toBe(false);
  });

  it("price chips are mutually exclusive — selecting one deselects others", () => {
    const onChange = vi.fn();
    // Start with "Under $50" active
    renderFilterChips({ maxPrice: 5000 }, onChange);
    // Click "$100–$200" — should replace price filter
    act(() => {
      getChipByLabel("$100–$200")!.click();
    });
    expect(onChange).toHaveBeenCalledWith({
      minPrice: 10000,
      maxPrice: 20000,
      inStock: undefined,
    });
  });

  it('"In Stock" can combine with price chips', () => {
    const onChange = vi.fn();
    // Start with "Under $50" active, no inStock
    renderFilterChips({ maxPrice: 5000 }, onChange);
    act(() => {
      getChipByLabel("In Stock")!.click();
    });
    expect(onChange).toHaveBeenCalledWith({
      minPrice: undefined,
      maxPrice: 5000,
      inStock: true,
    });
  });

  it("toggling an already-active price chip deselects it", () => {
    const onChange = vi.fn();
    renderFilterChips({ maxPrice: 5000 }, onChange);
    act(() => {
      getChipByLabel("Under $50")!.click();
    });
    // Should clear price filters (toggle off)
    expect(onChange).toHaveBeenCalledWith({
      minPrice: undefined,
      maxPrice: undefined,
      inStock: undefined,
    });
  });

  it("toggling In Stock off preserves price filter", () => {
    const onChange = vi.fn();
    renderFilterChips({ maxPrice: 5000, inStock: true }, onChange);
    act(() => {
      getChipByLabel("In Stock")!.click();
    });
    expect(onChange).toHaveBeenCalledWith({
      minPrice: undefined,
      maxPrice: 5000,
      inStock: undefined,
    });
  });

  it('"$200+" sets only minPrice with no maxPrice', () => {
    const onChange = vi.fn();
    renderFilterChips({}, onChange);
    act(() => {
      getChipByLabel("$200+")!.click();
    });
    expect(onChange).toHaveBeenCalledWith({
      minPrice: 20000,
      maxPrice: undefined,
      inStock: undefined,
    });
  });
});
