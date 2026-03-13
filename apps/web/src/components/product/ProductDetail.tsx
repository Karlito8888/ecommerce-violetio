import { useState, useMemo } from "react";
import type { Product, SKU } from "@ecommerce/shared";
import { stripHtml } from "@ecommerce/shared";
import ImageGallery from "./ImageGallery";
import VariantSelector from "./VariantSelector";
import PriceBreakdown from "./PriceBreakdown";

import "./ProductDetail.css";

/**
 * Main Product Detail Page component.
 *
 * ## Layout
 * ```
 * Desktop (≥1024px):                    Mobile (<1024px):
 * ┌─────────────┬──────────┐            ┌──────────────────┐
 * │             │ Merchant │            │   [Hero Image]   │
 * │  [Gallery]  │ Name     │            │   [Thumbnails]   │
 * │   60%       │ Price    │            │ Merchant         │
 * │             │ Variants │            │ Name             │
 * │             │ Add Bag  │            │ Price            │
 * │             │ Trust    │            │ Variants         │
 * └─────────────┴──────────┘            │ Add to Bag       │
 *                                       │ Trust            │
 *                                       └──────────────────┘
 * ```
 *
 * ## Variant Selection Logic (Violet.io)
 *
 * Products with multiple SKUs use a selection algorithm:
 * 1. Each `ProductVariant` (Size, Color) renders a selector group
 * 2. User clicks options → `selectedValues` state updates
 * 3. Matching SKU found by comparing ALL `variantValues` against selected values
 * 4. Price, availability, and images update from the matched SKU
 *
 * Products with 0-1 SKUs skip variant selectors entirely (Violet best practice).
 *
 * ## HTML Description Security
 *
 * `product.htmlDescription` comes from merchant platforms and may contain
 * arbitrary HTML. We strip all HTML tags via the shared `stripHtml()` utility
 * and render as safe plain text. This avoids XSS without adding a DOMPurify
 * dependency. React's JSX escaping provides a second layer of defense.
 *
 * ## "Add to Bag" CTA State
 *
 * For multi-variant products, the CTA is disabled until ALL variant dimensions
 * are selected and the matched SKU is available. This prevents a UX dead-end
 * when cart integration arrives (Story 4.1) — Violet's Cart API requires a
 * specific `sku_id`, not just an `offer_id`.
 *
 * @see https://docs.violet.io/api-reference/catalog/offers/get-offer-by-id
 */
export default function ProductDetail({ product }: { product: Product }) {
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});

  /**
   * Find the SKU matching ALL currently selected variant values.
   *
   * Returns `null` if not all variants are selected yet or no SKU matches.
   * Uses strict matching: every selected value must appear in the SKU's
   * `variantValues` array for it to be considered a match.
   */
  const selectedSku: SKU | null = useMemo(() => {
    if (product.variants.length === 0 && product.skus.length === 1) {
      return product.skus[0];
    }
    const entries = Object.entries(selectedValues);
    if (entries.length < product.variants.length) return null;
    return (
      product.skus.find((sku) =>
        entries.every(([vName, vValue]) =>
          sku.variantValues.some(
            (sv) => sv.variant.toLowerCase() === vName.toLowerCase() && sv.value === vValue,
          ),
        ),
      ) ?? null
    );
  }, [selectedValues, product.skus, product.variants.length]);

  const showVariants = product.variants.length > 0 && product.skus.length > 1;

  /**
   * Determine if the "Add to Bag" CTA should be enabled.
   *
   * ## Logic (Violet.io best practice)
   *
   * - **Multi-variant products**: button is disabled until ALL variants are selected
   *   and the matched SKU is in stock (`inStock && qtyAvailable > 0`).
   *   Rationale: you can't add to cart without a specific SKU — Violet's Cart API
   *   requires a `sku_id`, not just an `offer_id`.
   *
   * - **Single/no-variant products**: falls back to `product.available` since the
   *   SKU is auto-selected (line above) and availability is offer-level.
   *
   * @see Story 4.1 for cart integration where this matters
   */
  const isAvailable = showVariants
    ? selectedSku !== null && selectedSku.inStock && selectedSku.qtyAvailable > 0
    : selectedSku
      ? selectedSku.inStock && selectedSku.qtyAvailable > 0
      : product.available;

  const handleVariantSelect = (variantName: string, value: string) => {
    setSelectedValues((prev) => ({ ...prev, [variantName]: value }));
  };

  /** Safe plain-text description — HTML stripped via shared `stripHtml` utility. */
  const plainDescription = stripHtml(product.htmlDescription ?? product.description);

  return (
    <div className="product-detail">
      <div className="product-detail__gallery">
        <ImageGallery images={product.images} productName={product.name} />
      </div>

      <div className="product-detail__info">
        <p className="product-detail__merchant">{product.seller}</p>
        <h2 className="product-detail__name">{product.name}</h2>

        <PriceBreakdown
          selectedSku={selectedSku}
          minPrice={product.minPrice}
          maxPrice={product.maxPrice}
          currency={product.currency}
        />

        {showVariants && (
          <VariantSelector
            variants={product.variants}
            skus={product.skus}
            selectedValues={selectedValues}
            onSelect={handleVariantSelect}
          />
        )}

        <button
          type="button"
          className={`product-detail__cta${!isAvailable ? " product-detail__cta--disabled" : ""}`}
          disabled={!isAvailable}
          onClick={() => {
            /**
             * TODO: Story 4.1 — Cart API integration
             * Replace this placeholder with: addToCart({ skuId: selectedSku.id, quantity: 1 })
             * The Violet Cart API requires a specific sku_id — this is why the button
             * is disabled until a SKU is selected on multi-variant products.
             */
          }}
        >
          {isAvailable ? "Add to Bag" : "Notify When Available"}
        </button>

        <p className="product-detail__affiliate">
          We earn a commission on purchases — this doesn&apos;t affect the price you pay.
        </p>

        <div className="product-detail__trust">
          <span>Secure checkout</span>
          <span aria-hidden="true">·</span>
          <span>Free returns</span>
          <span aria-hidden="true">·</span>
          <span>Verified merchant</span>
        </div>
      </div>

      <div className="product-detail__description">
        <h3>Description</h3>
        <p>{plainDescription}</p>
      </div>

      <div className="product-detail__similar">
        <h3>Similar Products</h3>
        <p>Recommendations coming soon</p>
      </div>
    </div>
  );
}
