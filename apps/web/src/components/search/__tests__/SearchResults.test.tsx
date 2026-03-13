/**
 * SearchResults component tests.
 *
 * Uses direct React rendering (via react-dom/client) to avoid the Bun workspace
 * CJS dual-instance issue with @testing-library/react.
 *
 * Tests cover:
 * - Renders product cards from ProductMatch[] data
 * - Displays match explanations for each result
 * - Shows empty state with suggestions when no results
 * - Shows error state with CTA when search fails
 * - Shows skeleton loading state while fetching
 * - aria-live="polite" on results region
 * - Result count is not shown (handled by parent)
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { ProductMatch, MatchExplanations } from "@ecommerce/shared";
import SearchResults from "../SearchResults";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children, ...rest }: Record<string, unknown>) => {
    const href =
      typeof to === "string" && params && typeof params === "object"
        ? to.replace(/\$(\w+)/g, (_, key: string) => (params as Record<string, string>)[key] ?? "")
        : to;
    return React.createElement("a", { href, ...rest }, children as React.ReactNode);
  },
}));

function createMockProductMatch(overrides: Partial<ProductMatch> = {}): ProductMatch {
  return {
    id: "pm-1",
    name: "Luxury Candle",
    description: "A lovely scented candle",
    minPrice: 2999,
    maxPrice: 2999,
    currency: "USD",
    available: true,
    vendor: "Cozy Home Co",
    source: "SHOPIFY",
    externalUrl: "https://example.com",
    thumbnailUrl: "https://cdn.example.com/candle.jpg",
    similarity: 0.89,
    ...overrides,
  };
}

function renderToContainer(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);

  act(() => {
    createRoot(container).render(element);
  });

  return container;
}

describe("SearchResults", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders product cards from ProductMatch data", () => {
    const products: ProductMatch[] = [
      createMockProductMatch({ id: "1", name: "Candle" }),
      createMockProductMatch({ id: "2", name: "Vase" }),
    ];
    const explanations: MatchExplanations = {};

    const container = renderToContainer(
      <SearchResults
        products={products}
        explanations={explanations}
        query="home decor"
        isLoading={false}
        error={null}
      />,
    );

    expect(container.textContent).toContain("Candle");
    expect(container.textContent).toContain("Vase");
  });

  it("displays match explanations for each result", () => {
    const products: ProductMatch[] = [createMockProductMatch({ id: "1", name: "Candle" })];
    const explanations: MatchExplanations = {
      "1": "Great gift for someone who enjoys relaxation",
    };

    const container = renderToContainer(
      <SearchResults
        products={products}
        explanations={explanations}
        query="relaxation gift"
        isLoading={false}
        error={null}
      />,
    );

    expect(container.textContent).toContain("Great gift for someone who enjoys relaxation");
    const explanationEl = container.querySelector(".search-results__explanation");
    expect(explanationEl).not.toBeNull();
  });

  it("shows empty state when no results and query >= 2 chars", () => {
    const container = renderToContainer(
      <SearchResults
        products={[]}
        explanations={{}}
        query="xyzzy"
        isLoading={false}
        error={null}
      />,
    );

    expect(container.textContent).toContain("No results found");
    expect(container.textContent).toContain("xyzzy");
    expect(container.textContent).toContain("Browse all products");

    const browseLink = container.querySelector("a[href='/products']");
    expect(browseLink).not.toBeNull();
  });

  it("shows empty state suggestion text", () => {
    const container = renderToContainer(
      <SearchResults products={[]} explanations={{}} query="xyz" isLoading={false} error={null} />,
    );

    expect(container.textContent).toContain("red dress under $50 for a summer wedding");
  });

  it("shows error state with CTA when search fails", () => {
    const container = renderToContainer(
      <SearchResults
        products={[]}
        explanations={{}}
        query="test"
        isLoading={false}
        error={new Error("Network error")}
      />,
    );

    expect(container.textContent).toContain("Something went wrong");
    expect(container.textContent).toContain("Browse products");

    const errorDiv = container.querySelector(".search-results__error");
    expect(errorDiv).not.toBeNull();
    expect(errorDiv!.getAttribute("role")).toBe("alert");

    const browseLink = container.querySelector("a[href='/products']");
    expect(browseLink).not.toBeNull();
  });

  it("shows skeleton loading state while fetching", () => {
    const container = renderToContainer(
      <SearchResults products={[]} explanations={{}} query="test" isLoading={true} error={null} />,
    );

    const skeleton = container.querySelector(".search-results__skeleton");
    expect(skeleton).not.toBeNull();
    expect(skeleton!.getAttribute("aria-busy")).toBe("true");
    expect(skeleton!.getAttribute("aria-label")).toBe("Loading search results");
  });

  it("has aria-live='polite' on results region", () => {
    const products: ProductMatch[] = [createMockProductMatch()];

    const container = renderToContainer(
      <SearchResults
        products={products}
        explanations={{}}
        query="test"
        isLoading={false}
        error={null}
      />,
    );

    const resultsDiv = container.querySelector(".search-results");
    expect(resultsDiv!.getAttribute("aria-live")).toBe("polite");
  });

  it("renders product with price formatted correctly", () => {
    const products: ProductMatch[] = [createMockProductMatch({ minPrice: 10050, currency: "USD" })];

    const container = renderToContainer(
      <SearchResults
        products={products}
        explanations={{}}
        query="test"
        isLoading={false}
        error={null}
      />,
    );

    expect(container.textContent).toContain("$100.50");
  });

  it("renders grid with role='list' and items with role='listitem'", () => {
    const products: ProductMatch[] = [createMockProductMatch()];

    const container = renderToContainer(
      <SearchResults
        products={products}
        explanations={{}}
        query="test"
        isLoading={false}
        error={null}
      />,
    );

    const grid = container.querySelector(".search-results__grid");
    expect(grid!.getAttribute("role")).toBe("list");

    const items = container.querySelectorAll("[role='listitem']");
    expect(items.length).toBe(1);
  });

  it("links product cards to /products/$productId", () => {
    const products: ProductMatch[] = [createMockProductMatch({ id: "prod-42" })];

    const container = renderToContainer(
      <SearchResults
        products={products}
        explanations={{}}
        query="test"
        isLoading={false}
        error={null}
      />,
    );

    const link = container.querySelector("a[href='/products/prod-42']");
    expect(link).not.toBeNull();
  });
});
