/**
 * PriceBreakdown component tests.
 *
 * Tests cover:
 * - Renders formatted price via formatPrice()
 * - Sale price shows original struck through
 * - Price range shown when minPrice !== maxPrice and no SKU selected
 * - Rendered as <dl> for accessibility
 * - Shows "Calculated at checkout" for shipping/tax
 */
import { afterEach, describe, it, expect } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { SKU } from "@ecommerce/shared";
import PriceBreakdown from "../PriceBreakdown";

function createMockSku(overrides: Partial<SKU> = {}): SKU {
  return {
    id: "sku-1",
    offerId: "prod-1",
    merchantId: "m-1",
    name: "Default SKU",
    inStock: true,
    qtyAvailable: 10,
    salePrice: 2999,
    retailPrice: 2999,
    currency: "USD",
    taxable: true,
    type: "PHYSICAL",
    status: "AVAILABLE",
    variantValues: [],
    dimensions: null,
    albums: [],
    dateCreated: "2024-01-01",
    dateLastModified: "2024-01-01",
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

describe("PriceBreakdown", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders formatted price from selected SKU", () => {
    const sku = createMockSku({ salePrice: 4500 });
    const container = renderToContainer(
      <PriceBreakdown selectedSku={sku} minPrice={4500} maxPrice={4500} currency="USD" />,
    );

    expect(container.textContent).toContain("$45.00");
  });

  it("shows original price struck through when on sale", () => {
    const sku = createMockSku({ salePrice: 1999, retailPrice: 3999 });
    const container = renderToContainer(
      <PriceBreakdown selectedSku={sku} minPrice={1999} maxPrice={3999} currency="USD" />,
    );

    const original = container.querySelector(".price-breakdown__original");
    expect(original).not.toBeNull();
    expect(original!.textContent).toContain("$39.99");

    const sale = container.querySelector(".price-breakdown__sale");
    expect(sale).not.toBeNull();
    expect(sale!.textContent).toContain("$19.99");
  });

  it("shows price range when no SKU selected and prices differ", () => {
    const container = renderToContainer(
      <PriceBreakdown selectedSku={null} minPrice={1999} maxPrice={4999} currency="USD" />,
    );

    const range = container.querySelector(".price-breakdown__range");
    expect(range).not.toBeNull();
    expect(range!.textContent).toContain("From $19.99");
    expect(range!.textContent).toContain("$49.99");
  });

  it("shows single price when no SKU selected but prices are equal", () => {
    const container = renderToContainer(
      <PriceBreakdown selectedSku={null} minPrice={2999} maxPrice={2999} currency="USD" />,
    );

    const range = container.querySelector(".price-breakdown__range");
    expect(range).toBeNull();
    expect(container.textContent).toContain("$29.99");
  });

  it("renders as <dl> for screen reader accessibility", () => {
    const sku = createMockSku();
    const container = renderToContainer(
      <PriceBreakdown selectedSku={sku} minPrice={2999} maxPrice={2999} currency="USD" />,
    );

    const dl = container.querySelector("dl.price-breakdown");
    expect(dl).not.toBeNull();
  });

  it("shows 'Calculated at checkout' for shipping and tax", () => {
    const sku = createMockSku();
    const container = renderToContainer(
      <PriceBreakdown selectedSku={sku} minPrice={2999} maxPrice={2999} currency="USD" />,
    );

    const text = container.textContent!;
    expect(text).toContain("Shipping");
    expect(text).toContain("Tax");
    // Both should say "Calculated at checkout"
    const matches = text.match(/Calculated at checkout/g);
    expect(matches!.length).toBe(2);
  });

  it("does not show discount styling when retail equals sale price", () => {
    const sku = createMockSku({ salePrice: 2999, retailPrice: 2999 });
    const container = renderToContainer(
      <PriceBreakdown selectedSku={sku} minPrice={2999} maxPrice={2999} currency="USD" />,
    );

    expect(container.querySelector(".price-breakdown__original")).toBeNull();
    expect(container.querySelector(".price-breakdown__sale")).toBeNull();
  });
});
