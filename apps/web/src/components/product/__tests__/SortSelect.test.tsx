/**
 * SortSelect component tests.
 *
 * Uses direct React rendering (via react-dom/client) to match the project's
 * test pattern (avoids Bun workspace CJS dual-instance issue with @testing-library/react).
 *
 * Tests cover:
 * - Renders 3 sort options (Relevance, Price Low-High, Price High-Low)
 * - Default selection is Relevance
 * - Changing to "Price: Low to High" triggers onSortChange("price", "ASC")
 * - Changing to "Price: High to Low" triggers onSortChange("price", "DESC")
 * - Changing back to "Relevance" triggers onSortChange(undefined, undefined)
 * - Accessible: <label> is associated with <select> via htmlFor/id
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import SortSelect from "../SortSelect";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function renderSortSelect(
  sortBy?: "relevance" | "price",
  sortDirection?: "ASC" | "DESC",
  onSortChange = vi.fn(),
) {
  act(() => {
    root.render(
      <SortSelect sortBy={sortBy} sortDirection={sortDirection} onSortChange={onSortChange} />,
    );
  });
  return onSortChange;
}

function getSelect(): HTMLSelectElement {
  return container.querySelector<HTMLSelectElement>("select")!;
}

function changeSelect(value: string) {
  const select = getSelect();
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("SortSelect", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders 3 sort options", () => {
    renderSortSelect();
    const options = Array.from(getSelect().options);
    expect(options.length).toBe(3);
    expect(options.map((o) => o.textContent)).toEqual([
      "Relevance",
      "Price: Low to High",
      "Price: High to Low",
    ]);
  });

  it("default selection is Relevance", () => {
    renderSortSelect();
    expect(getSelect().value).toBe("relevance");
  });

  it("reflects sortBy=price, sortDirection=ASC as price-asc", () => {
    renderSortSelect("price", "ASC");
    expect(getSelect().value).toBe("price-asc");
  });

  it("reflects sortBy=price, sortDirection=DESC as price-desc", () => {
    renderSortSelect("price", "DESC");
    expect(getSelect().value).toBe("price-desc");
  });

  it('changing to "Price: Low to High" triggers onSortChange("price", "ASC")', () => {
    const onChange = vi.fn();
    renderSortSelect(undefined, undefined, onChange);
    changeSelect("price-asc");
    expect(onChange).toHaveBeenCalledWith("price", "ASC");
  });

  it('changing to "Price: High to Low" triggers onSortChange("price", "DESC")', () => {
    const onChange = vi.fn();
    renderSortSelect(undefined, undefined, onChange);
    changeSelect("price-desc");
    expect(onChange).toHaveBeenCalledWith("price", "DESC");
  });

  it('changing to "Relevance" triggers onSortChange(undefined, undefined)', () => {
    const onChange = vi.fn();
    renderSortSelect("price", "ASC", onChange);
    changeSelect("relevance");
    expect(onChange).toHaveBeenCalledWith(undefined, undefined);
  });

  it("has label associated with select via htmlFor", () => {
    renderSortSelect();
    const label = container.querySelector<HTMLLabelElement>("label")!;
    expect(label.textContent).toBe("Sort by");
    expect(label.getAttribute("for")).toBe("sort-select");
    expect(getSelect().id).toBe("sort-select");
  });
});
