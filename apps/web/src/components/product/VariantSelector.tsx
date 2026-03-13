import type { ProductVariant, SKU } from "@ecommerce/shared";

import "./VariantSelector.css";

/**
 * SKU variant picker for products with multiple options (Size, Color, etc.).
 *
 * ## Violet.io Variant/SKU Selection Logic
 *
 * Violet's Offer response contains two related structures:
 * - `variants[]`: option dimensions (e.g., `{ name: "Size", values: ["S", "M", "L"] }`)
 * - `skus[]`: purchasable combinations with `variantValues` array
 *
 * ### Selection Algorithm
 * 1. User selects variant values (e.g., Size=M, Color=Red)
 * 2. Parent component finds matching SKU from `skus[]` by comparing all `variantValues`
 * 3. Price, availability, and images update from the matched SKU
 *
 * ### Availability Check (Violet best practice)
 * A variant combination is "available" if a matching SKU exists with:
 * - `sku.inStock === true` AND `sku.qtyAvailable > 0`
 * Unavailable combinations are visually grayed out with `aria-disabled="true"`.
 *
 * Epic 3 Review — Fix I6: Uses native `disabled` attribute instead of
 * `aria-disabled` + onClick guard. Native `disabled` prevents keyboard
 * activation (Enter/Space), removes the element from tab order, and
 * communicates disabled state to screen readers — all in one attribute.
 *
 * ### Display Order
 * Variant `values` array order comes from the merchant — we preserve it as-is.
 *
 * @see https://docs.violet.io/concepts/skus
 */
export default function VariantSelector({
  variants,
  skus,
  selectedValues,
  onSelect,
}: {
  variants: ProductVariant[];
  skus: SKU[];
  selectedValues: Record<string, string>;
  onSelect: (variantName: string, value: string) => void;
}) {
  /**
   * Check if a specific variant value has at least one available SKU.
   *
   * Builds a "hypothetical selection" merging the current selections with
   * the candidate value, then checks if any SKU matches all selected values
   * and is in stock. This correctly handles multi-dimension variants
   * (e.g., Size=M + Color=Red must both match a single SKU).
   */
  function isValueAvailable(variantName: string, value: string): boolean {
    const hypothetical = { ...selectedValues, [variantName]: value };
    return skus.some(
      (sku) =>
        sku.inStock &&
        sku.qtyAvailable > 0 &&
        Object.entries(hypothetical).every(([vName, vValue]) =>
          sku.variantValues.some(
            (sv) => sv.variant.toLowerCase() === vName.toLowerCase() && sv.value === vValue,
          ),
        ),
    );
  }

  return (
    <div className="variant-selector">
      {variants.map((variant) => (
        <div
          key={variant.name}
          className="variant-selector__group"
          role="radiogroup"
          aria-label={`Select ${variant.name}`}
        >
          <span className="variant-selector__label">
            {variant.name.charAt(0).toUpperCase() + variant.name.slice(1)}
          </span>
          <div className="variant-selector__options">
            {variant.values.map((value) => {
              const isActive = selectedValues[variant.name] === value;
              const available = isValueAvailable(variant.name, value);

              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={!available}
                  className={`variant-selector__option${isActive ? " variant-selector__option--active" : ""}${!available ? " variant-selector__option--disabled" : ""}`}
                  onClick={() => onSelect(variant.name, value)}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
