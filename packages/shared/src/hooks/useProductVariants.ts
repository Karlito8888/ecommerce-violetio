import { useMemo } from "react";
import type { Product, ProductImage, SKU, VariantValue } from "../types/index.js";

/**
 * Derived variant/SKU state for product detail pages.
 *
 * Computed from a `Product` + user's variant selections. Platform-agnostic —
 * price formatting and image optimization are left to the caller.
 */
export interface ProductVariantsResult {
  /** Whether the variant selector UI should be shown (multi-SKU products only). */
  showVariants: boolean;
  /** The SKU matching all currently selected variant values, or auto-selected for single-SKU. */
  selectedSku: SKU | null;
  /** Whether the "Add to Bag" CTA should be enabled. */
  isAvailable: boolean;
  /** Whether the selected SKU has a discount (retailPrice > salePrice). */
  hasDiscount: boolean;
  /** Whether the price should show a range (no SKU selected, multi-variant product). */
  showPriceRange: boolean;
  /**
   * Gallery images for the currently selected variant.
   * SKU-specific images when available, offer-level images as fallback.
   */
  galleryImages: ProductImage[];
}

/**
 * Pre-select the first available option for each variant dimension.
 *
 * For a product with Size [S, M, L] and Color [Red, Blue], returns
 * `{ Size: "S", Color: "Red" }` if the S/Red SKU is in stock.
 *
 * If a combination is out of stock, it tries the next value until it finds
 * one that resolves to an in-stock SKU. Falls back to the first value
 * if no in-stock combination is found (the CTA will show "Sold Out").
 *
 * Returns an empty object for single/no-SKU products (no selection needed).
 */
export function getDefaultSelectedValues(product: Product): Record<string, string> {
  if (product.skus.length <= 1) return {};

  const defaults: Record<string, string> = {};

  for (const variant of product.variants) {
    // Find the first value that, combined with current defaults, yields an in-stock SKU
    let found = false;
    for (const value of variant.values) {
      const candidate = { ...defaults, [variant.name]: value };
      const hasInStockSku = product.skus.some(
        (sku) =>
          sku.inStock &&
          sku.qtyAvailable > 0 &&
          Object.entries(candidate).every(([vName, vValue]) =>
            sku.variantValues.some(
              (sv) => sv.variant.toLowerCase() === vName.toLowerCase() && sv.value === vValue,
            ),
          ),
      );
      if (hasInStockSku) {
        defaults[variant.name] = value;
        found = true;
        break;
      }
    }
    // Fallback: first value even if out of stock
    if (!found && variant.values.length > 0) {
      defaults[variant.name] = variant.values[0];
    }
  }

  return defaults;
}

/**
 * Shared variant selection logic for product detail pages (web + mobile).
 *
 * ## Why a shared hook?
 *
 * The SKU resolution, image extraction, and availability logic are pure computations
 * derived from `product` + `selectedValues`. Extracting them ensures:
 * - **DRY**: identical algorithm across web and mobile
 * - **Single source of truth**: one place to fix bugs
 * - **Testable**: unit tests in `@ecommerce/shared` cover both platforms
 *
 * ## Pre-selection
 *
 * Use `getDefaultSelectedValues(product)` to initialize `selectedValues` so the
 * first variant option is pre-selected and the matching SKU is resolved immediately.
 * This avoids showing "Notify When Available" or "Select options" on products
 * that are actually in stock.
 *
 * @param product The full product (mapped from Violet Offer)
 * @param selectedValues Current variant selections keyed by variant name (e.g., `{ "Size": "M" }`)
 */
export function useProductVariants(
  product: Product,
  selectedValues: Record<string, string>,
): ProductVariantsResult {
  const showVariants = product.variants.length > 0 && product.skus.length > 1;

  /**
   * Find the SKU matching ALL currently selected variant values.
   *
   * Case-insensitive: Violet demo merchants may return "Color" or "color"
   * for the same variant dimension.
   *
   * Single-SKU products are auto-selected regardless of variant definitions.
   */
  const selectedSku: SKU | null = useMemo(() => {
    if (product.skus.length === 1) return product.skus[0];
    if (product.skus.length === 0) return null;

    const entries = Object.entries(selectedValues);
    if (entries.length < product.variants.length) return null;

    return (
      product.skus.find((sku) =>
        entries.every(([vName, vValue]) =>
          sku.variantValues.some(
            (sv: VariantValue) =>
              sv.variant.toLowerCase() === vName.toLowerCase() && sv.value === vValue,
          ),
        ),
      ) ?? null
    );
  }, [selectedValues, product.skus, product.variants.length]);

  /**
   * CTA availability.
   *
   * - Multi-variant: disabled until ALL variants selected AND SKU is in stock.
   * - Single/no-variant: auto-selected, fallback to `product.available`.
   */
  const isAvailable = showVariants
    ? selectedSku !== null && selectedSku.inStock && selectedSku.qtyAvailable > 0
    : selectedSku
      ? selectedSku.inStock && selectedSku.qtyAvailable > 0
      : product.available;

  const hasDiscount = selectedSku ? selectedSku.retailPrice > selectedSku.salePrice : false;

  const showPriceRange = !selectedSku && showVariants;

  /**
   * Dynamic gallery images: SKU-specific when available, offer-level otherwise.
   *
   * When a merchant attaches images per variant in Shopify, Violet surfaces them
   * as SKU-level albums. If the selected SKU has images, show those instead of
   * the full offer gallery — giving a color-accurate view.
   */
  const galleryImages: ProductImage[] = useMemo(() => {
    if (selectedSku && selectedSku.albums.length > 0) {
      const skuImages = selectedSku.albums
        .flatMap((album) => album.media)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((m) => ({
          id: m.id,
          url: m.url,
          displayOrder: m.displayOrder,
          primary: m.primary,
        }));
      if (skuImages.length > 0) return skuImages;
    }
    return product.images;
  }, [selectedSku, product.images]);

  return { showVariants, selectedSku, isAvailable, hasDiscount, showPriceRange, galleryImages };
}
