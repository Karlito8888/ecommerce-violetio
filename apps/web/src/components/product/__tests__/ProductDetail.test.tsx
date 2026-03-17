/**
 * ProductDetail component tests.
 *
 * Uses direct React rendering (react-dom/client) to avoid Bun workspace
 * CJS dual-instance issue with @testing-library/react.
 *
 * Tests cover:
 * - Renders product name (H2), merchant, description
 * - "Add to Bag" button enabled when available
 * - Out-of-stock renders "Notify When Available"
 * - Affiliate disclosure text present
 * - Trust indicators rendered
 * - Single SKU products auto-select the SKU
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { Product, SKU } from "@ecommerce/shared";
import ProductDetail from "../ProductDetail";

// Mock cart hooks to avoid QueryClientProvider + CartProvider tree requirements
// (Bun workspace dual-React-instance issue — see test file header comment)
vi.mock("@ecommerce/shared", async (importOriginal) => {
  const original = await importOriginal<typeof import("@ecommerce/shared")>();
  return {
    ...original,
    useAddToCart: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock("../../../contexts/CartContext", () => ({
  useCartContext: vi.fn().mockReturnValue({
    cartId: null,
    violetCartId: null,
    isDrawerOpen: false,
    openDrawer: vi.fn(),
    closeDrawer: vi.fn(),
    setCart: vi.fn(),
    clearCart: vi.fn(),
  }),
  CartProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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

function createMockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    name: "Artisan Vase",
    description: "A handcrafted ceramic vase",
    htmlDescription: "<p>A <strong>handcrafted</strong> ceramic vase</p>",
    minPrice: 4500,
    maxPrice: 4500,
    currency: "USD",
    available: true,
    visible: true,
    status: "AVAILABLE",
    publishingStatus: "PUBLISHED",
    source: "SHOPIFY",
    seller: "Studio Pottery Co",
    vendor: "CeramicArts",
    type: "PHYSICAL",
    externalUrl: "https://example.com",
    merchantId: "m-1",
    productId: "p-1",
    commissionRate: 10,
    tags: [],
    dateCreated: "2024-01-01",
    dateLastModified: "2024-01-01",
    variants: [],
    skus: [createMockSku()],
    albums: [],
    images: [],
    thumbnailUrl: null,
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

describe("ProductDetail", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders product name as H2 and merchant name", () => {
    const container = renderToContainer(<ProductDetail product={createMockProduct()} />);

    const h2 = container.querySelector("h2");
    expect(h2).not.toBeNull();
    expect(h2!.textContent).toBe("Artisan Vase");
    expect(container.textContent).toContain("Studio Pottery Co");
  });

  it("renders description (strips HTML from htmlDescription)", () => {
    const container = renderToContainer(<ProductDetail product={createMockProduct()} />);

    expect(container.textContent).toContain("A handcrafted ceramic vase");
    // Should NOT contain HTML tags
    expect(container.innerHTML).not.toContain("<strong>");
  });

  it("renders 'Add to Bag' button when product is available", () => {
    const container = renderToContainer(<ProductDetail product={createMockProduct()} />);

    const button = container.querySelector(".product-detail__cta") as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.textContent).toBe("Add to Bag");
    expect(button.disabled).toBe(false);
  });

  it("renders 'Notify When Available' when product is out of stock", () => {
    const product = createMockProduct({
      available: false,
      skus: [createMockSku({ inStock: false, qtyAvailable: 0 })],
    });
    const container = renderToContainer(<ProductDetail product={product} />);

    const button = container.querySelector(".product-detail__cta") as HTMLButtonElement;
    expect(button.textContent).toBe("Notify When Available");
    expect(button.disabled).toBe(true);
  });

  it("renders affiliate disclosure text", () => {
    const container = renderToContainer(<ProductDetail product={createMockProduct()} />);

    expect(container.textContent).toContain("We earn a commission on purchases");
  });

  it("renders trust indicators", () => {
    const container = renderToContainer(<ProductDetail product={createMockProduct()} />);

    const trust = container.querySelector(".product-detail__trust");
    expect(trust).not.toBeNull();
    expect(trust!.textContent).toContain("Secure checkout");
    expect(trust!.textContent).toContain("Free returns");
    expect(trust!.textContent).toContain("Verified merchant");
  });

  it("renders recommendations section container (RecommendationRow handles content)", () => {
    const container = renderToContainer(<ProductDetail product={createMockProduct()} />);

    // RecommendationRow is wrapped in an ErrorBoundary that renders null in test
    // environments without QueryClientProvider. The container div still exists.
    const similarDiv = container.querySelector(".product-detail__similar");
    expect(similarDiv).not.toBeNull();
  });

  it("does not show variant selector for single-SKU products", () => {
    const container = renderToContainer(<ProductDetail product={createMockProduct()} />);

    const variantSelector = container.querySelector(".variant-selector");
    expect(variantSelector).toBeNull();
  });

  it("disables 'Add to Bag' on multi-variant products until all variants selected", () => {
    const product = createMockProduct({
      variants: [{ name: "Size", values: ["S", "M"] }],
      skus: [
        createMockSku({
          id: "sku-s",
          salePrice: 2999,
          retailPrice: 2999,
          variantValues: [{ variant: "Size", value: "S" }],
        }),
        createMockSku({
          id: "sku-m",
          salePrice: 2999,
          retailPrice: 2999,
          variantValues: [{ variant: "Size", value: "M" }],
        }),
      ],
    });
    const container = renderToContainer(<ProductDetail product={product} />);

    // Before selecting any variant, button should be disabled
    const button = container.querySelector(".product-detail__cta") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Notify When Available");
  });

  it("renders price from single SKU using formatPrice", () => {
    const product = createMockProduct({
      minPrice: 4500,
      maxPrice: 4500,
      skus: [createMockSku({ salePrice: 4500, retailPrice: 4500 })],
    });
    const container = renderToContainer(<ProductDetail product={product} />);

    expect(container.textContent).toContain("$45.00");
  });
});
