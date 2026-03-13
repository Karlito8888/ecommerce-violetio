/**
 * VariantSelector component tests.
 *
 * Tests cover:
 * - Renders variant groups with labels
 * - Click option triggers onSelect callback
 * - Disabled options have aria-disabled="true"
 * - Active option has --active modifier class
 * - Uses radiogroup role for accessibility
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { ProductVariant, SKU } from "@ecommerce/shared";
import VariantSelector from "../VariantSelector";

const mockVariants: ProductVariant[] = [
  { name: "Size", values: ["S", "M", "L"] },
  { name: "Color", values: ["Red", "Blue"] },
];

function createMockSku(
  size: string,
  color: string,
  inStock = true,
  overrides: Partial<SKU> = {},
): SKU {
  return {
    id: `sku-${size}-${color}`,
    offerId: "prod-1",
    merchantId: "m-1",
    name: `${size} ${color}`,
    inStock,
    qtyAvailable: inStock ? 5 : 0,
    salePrice: 2999,
    retailPrice: 2999,
    currency: "USD",
    taxable: true,
    type: "PHYSICAL",
    status: "AVAILABLE",
    variantValues: [
      { variant: "Size", value: size },
      { variant: "Color", value: color },
    ],
    dimensions: null,
    albums: [],
    dateCreated: "2024-01-01",
    dateLastModified: "2024-01-01",
    ...overrides,
  };
}

const mockSkus: SKU[] = [
  createMockSku("S", "Red"),
  createMockSku("S", "Blue"),
  createMockSku("M", "Red"),
  createMockSku("M", "Blue"),
  createMockSku("L", "Red", false), // L-Red out of stock
  createMockSku("L", "Blue"),
];

function renderToContainer(element: React.ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container;
}

describe("VariantSelector", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders variant groups with labels", () => {
    const container = renderToContainer(
      <VariantSelector
        variants={mockVariants}
        skus={mockSkus}
        selectedValues={{}}
        onSelect={vi.fn()}
      />,
    );

    const labels = container.querySelectorAll(".variant-selector__label");
    expect(labels.length).toBe(2);
    expect(labels[0].textContent).toBe("Size");
    expect(labels[1].textContent).toBe("Color");
  });

  it("renders all option values as buttons", () => {
    const container = renderToContainer(
      <VariantSelector
        variants={mockVariants}
        skus={mockSkus}
        selectedValues={{}}
        onSelect={vi.fn()}
      />,
    );

    const options = container.querySelectorAll(".variant-selector__option");
    expect(options.length).toBe(5); // 3 sizes + 2 colors
  });

  it("calls onSelect with variant name and value on click", () => {
    const onSelect = vi.fn();
    const container = renderToContainer(
      <VariantSelector
        variants={mockVariants}
        skus={mockSkus}
        selectedValues={{}}
        onSelect={onSelect}
      />,
    );

    const options = container.querySelectorAll(".variant-selector__option");
    // Click "M" (index 1 in size group)
    act(() => {
      (options[1] as HTMLButtonElement).click();
    });

    expect(onSelect).toHaveBeenCalledWith("Size", "M");
  });

  it("marks active option with --active modifier", () => {
    const container = renderToContainer(
      <VariantSelector
        variants={mockVariants}
        skus={mockSkus}
        selectedValues={{ Size: "M" }}
        onSelect={vi.fn()}
      />,
    );

    const options = container.querySelectorAll(".variant-selector__option");
    // "M" is index 1
    expect(options[1].classList.contains("variant-selector__option--active")).toBe(true);
    expect(options[0].classList.contains("variant-selector__option--active")).toBe(false);
  });

  it("marks unavailable options with aria-disabled='true'", () => {
    const container = renderToContainer(
      <VariantSelector
        variants={mockVariants}
        skus={mockSkus}
        selectedValues={{ Color: "Red" }}
        onSelect={vi.fn()}
      />,
    );

    // With Color=Red selected, L+Red is out of stock → L should be disabled
    const options = container.querySelectorAll(".variant-selector__option");
    // Size options: S(0), M(1), L(2)
    const lOption = options[2];
    /**
     * Epic 3 Review — Fix I6: Changed from aria-disabled to native `disabled`.
     * Native `disabled` prevents keyboard activation and communicates state to
     * screen readers, so aria-disabled is no longer needed.
     */
    expect((lOption as HTMLButtonElement).disabled).toBe(true);
    expect(lOption.classList.contains("variant-selector__option--disabled")).toBe(true);
  });

  it("uses radiogroup role for accessibility", () => {
    const container = renderToContainer(
      <VariantSelector
        variants={mockVariants}
        skus={mockSkus}
        selectedValues={{}}
        onSelect={vi.fn()}
      />,
    );

    const groups = container.querySelectorAll('[role="radiogroup"]');
    expect(groups.length).toBe(2);
    expect(groups[0].getAttribute("aria-label")).toBe("Select Size");
    expect(groups[1].getAttribute("aria-label")).toBe("Select Color");
  });
});
