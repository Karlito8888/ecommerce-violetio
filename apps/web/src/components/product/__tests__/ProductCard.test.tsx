/**
 * ProductCard component tests.
 *
 * Uses direct React rendering (via react-dom/client) to avoid the Bun workspace
 * CJS dual-instance issue with @testing-library/react.
 *
 * Tests cover:
 * - Renders product name, price, merchant
 * - Image alt text follows "[Name] by [Merchant]" pattern
 * - Out-of-stock state renders "Sold Out" badge and modifier class
 * - Links to `/products/${product.id}`
 * - Handles `thumbnailUrl: null` (placeholder image)
 * - Accessibility: article with aria-label "[Name], [Price]"
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { Product } from "@ecommerce/shared";
import ProductCard from "../ProductCard";

/**
 * Mock TanStack Router's <Link> component.
 *
 * ProductCard uses <Link to="/products/$productId" params={{ productId }}> which
 * requires a RouterProvider context. In unit tests we render components in isolation
 * (no router), so we replace <Link> with a plain <a> that renders the resolved href.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children, ...rest }: Record<string, unknown>) => {
    const href =
      typeof to === "string" && params && typeof params === "object"
        ? to.replace(/\$(\w+)/g, (_, key: string) => (params as Record<string, string>)[key] ?? "")
        : to;
    return React.createElement("a", { href, ...rest }, children as React.ReactNode);
  },
}));

function createMockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    name: "Luxury Candle",
    description: "A lovely candle",
    htmlDescription: null,
    minPrice: 2999,
    maxPrice: 2999,
    currency: "USD",
    available: true,
    visible: true,
    status: "AVAILABLE",
    publishingStatus: "PUBLISHED",
    source: "SHOPIFY",
    seller: "Cozy Home Co",
    vendor: "CandleMaker",
    type: "PHYSICAL",
    externalUrl: "https://example.com",
    merchantId: "m-1",
    productId: "p-1",
    commissionRate: 10,
    tags: [],
    dateCreated: "2024-01-01",
    dateLastModified: "2024-01-01",
    variants: [],
    skus: [],
    albums: [],
    images: [],
    thumbnailUrl: "https://cdn.example.com/candle.jpg",
    shippingInfo: null,
    collectionIds: [],
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

describe("ProductCard", () => {
  /**
   * DOM cleanup: each test appends a container to document.body via renderToContainer().
   * Without cleanup, containers accumulate and querySelector() may find elements from
   * previous tests, causing false positives or interference.
   *
   * Safe to clear here — this is a test-only jsdom environment, not a real browser.
   */
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders product name, price, and merchant", () => {
    const product = createMockProduct();
    const container = renderToContainer(<ProductCard product={product} />);

    expect(container.textContent).toContain("Luxury Candle");
    expect(container.textContent).toContain("$29.99");
    expect(container.textContent).toContain("Cozy Home Co");
  });

  it("formats price via formatPrice (cents → currency string)", () => {
    const product = createMockProduct({ minPrice: 10050, currency: "USD" });
    const container = renderToContainer(<ProductCard product={product} />);

    expect(container.textContent).toContain("$100.50");
  });

  it("sets image alt text to '[Name] by [Merchant]'", () => {
    const product = createMockProduct();
    const container = renderToContainer(<ProductCard product={product} />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.alt).toBe("Luxury Candle by Cozy Home Co");
  });

  it("links to /products/${product.id}", () => {
    const product = createMockProduct({ id: "prod-42" });
    const container = renderToContainer(<ProductCard product={product} />);

    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/products/prod-42");
  });

  it("renders placeholder when thumbnailUrl is null", () => {
    const product = createMockProduct({ thumbnailUrl: null });
    const container = renderToContainer(<ProductCard product={product} />);

    const img = container.querySelector("img");
    expect(img).toBeNull();

    const placeholder = container.querySelector(".product-card__placeholder");
    expect(placeholder).not.toBeNull();
  });

  it("renders 'Sold Out' badge when product is unavailable", () => {
    const product = createMockProduct({ available: false });
    const container = renderToContainer(<ProductCard product={product} />);

    expect(container.textContent).toContain("Sold Out");
    const badge = container.querySelector(".product-card__badge");
    expect(badge).not.toBeNull();
  });

  it("applies out-of-stock modifier class", () => {
    const product = createMockProduct({ available: false });
    const container = renderToContainer(<ProductCard product={product} />);

    const article = container.querySelector("article");
    expect(article!.classList.contains("product-card--out-of-stock")).toBe(true);
  });

  it("does NOT apply out-of-stock modifier when available", () => {
    const product = createMockProduct({ available: true });
    const container = renderToContainer(<ProductCard product={product} />);

    const article = container.querySelector("article");
    expect(article!.classList.contains("product-card--out-of-stock")).toBe(false);
  });

  it("article has aria-label with name and price", () => {
    const product = createMockProduct({ name: "Silk Scarf", minPrice: 4500 });
    const container = renderToContainer(<ProductCard product={product} />);

    const article = container.querySelector("article");
    expect(article!.getAttribute("aria-label")).toBe("Silk Scarf, $45.00");
  });

  it("lazy loads product image (loading attribute in HTML)", () => {
    const product = createMockProduct();
    const container = renderToContainer(<ProductCard product={product} />);

    const img = container.querySelector("img");
    // jsdom doesn't reflect `loading` as a DOM property, but it's set as an attribute
    expect(img!.getAttribute("loading")).toBe("lazy");
  });
});
