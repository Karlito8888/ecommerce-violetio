import { useState, useMemo, useCallback } from "react";
import type { Product, SKU } from "@ecommerce/shared";
import { stripHtml, useAddToCart, formatPrice } from "@ecommerce/shared";
import type { AddToCartFn } from "@ecommerce/shared";
import ImageGallery from "./ImageGallery";
import VariantSelector from "./VariantSelector";
import PriceBreakdown from "./PriceBreakdown";
import WishlistButton from "./WishlistButton";
import ShareButton from "../ui/ShareButton";
import RecommendationRow from "./RecommendationRow";
import { useCartContext } from "../../contexts/CartContext";
import { createCartFn, addToCartFn } from "../../server/cartActions";
import { getSupabaseBrowserClient } from "../../utils/supabase";

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
/**
 * Platform-specific add-to-cart function adapter.
 * Bridges TanStack Start Server Function convention to shared hook signature.
 */
const addToCartAdapter: AddToCartFn = (input) => addToCartFn({ data: input });

export default function ProductDetail({ product }: { product: Product }) {
  const [selectedValues, setSelectedValues] = useState<Record<string, string>>({});
  const [addButtonState, setAddButtonState] = useState<"idle" | "loading" | "added">("idle");

  const { violetCartId, setCart, openDrawer } = useCartContext();

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

  const addMutation = useAddToCart(violetCartId, addToCartAdapter, (cart) => {
    // On success: update CartContext with new IDs and open drawer
    setCart(cart.id, cart.violetCartId);
    openDrawer();
  });

  /**
   * Handles "Add to Bag" click:
   * 1. Reads the Supabase session to get userId (authenticated) or sessionId (anonymous)
   * 2. If no cart exists yet, creates one via createCartFn with the correct owner field
   * 3. Adds the selected SKU to the cart
   * 4. Shows confirmation state for 1.5s only on success
   *
   * ## Why we read the session here (not at component mount)
   * The session may change between mount and click (e.g. anonymous → signed in).
   * Reading at click time ensures we always use the current user context.
   *
   * ## userId vs sessionId convention (per Violet architecture)
   * - Authenticated user (is_anonymous = false): userId = user.id, sessionId = null
   * - Anonymous user (is_anonymous = true): userId = null, sessionId = user.id
   * Both satisfy the DB CHECK constraint `carts_has_owner`.
   */
  const handleAddToCart = useCallback(async () => {
    // eslint-disable-next-line no-console
    console.log("[cart] handleAddToCart:", {
      selectedSku: selectedSku?.id ?? null,
      addButtonState,
    });
    if (!selectedSku || addButtonState !== "idle") return;
    setAddButtonState("loading");

    try {
      // Read current Supabase session for cart ownership context
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user ?? null;
      const userId = user && !user.is_anonymous ? user.id : null;
      const sessionId = user?.is_anonymous ? user.id : null;

      let currentVioletCartId = violetCartId;

      // Create cart if none exists
      if (!currentVioletCartId) {
        const createResult = await createCartFn({
          data: { userId, sessionId },
        });
        if (createResult.error || !createResult.data) {
          // eslint-disable-next-line no-console
          console.error("[cart] createCart failed:", createResult.error);
          setAddButtonState("idle");
          return;
        }
        // eslint-disable-next-line no-console
        console.log("[cart] cart created:", createResult.data.violetCartId);
        setCart(createResult.data.id, createResult.data.violetCartId);
        currentVioletCartId = createResult.data.violetCartId;
      }

      // Use mutateAsync so we only show "added" on actual success
      const result = await addMutation.mutateAsync({
        violetCartId: currentVioletCartId,
        skuId: selectedSku.id,
        quantity: 1,
        userId,
        sessionId,
        productName: product.name,
        thumbnailUrl: product.thumbnailUrl ?? undefined,
      });

      if (result.data) {
        setAddButtonState("added");
        setTimeout(() => setAddButtonState("idle"), 1500);
      } else {
        setAddButtonState("idle");
      }
    } catch {
      setAddButtonState("idle");
    }
  }, [selectedSku, addButtonState, violetCartId, setCart, addMutation]);

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
          className={`product-detail__cta${!isAvailable || addButtonState !== "idle" ? " product-detail__cta--disabled" : ""}`}
          disabled={!isAvailable || addButtonState === "loading"}
          aria-busy={addButtonState === "loading"}
          onClick={handleAddToCart}
        >
          {addButtonState === "loading"
            ? "Adding…"
            : addButtonState === "added"
              ? "✓ Added!"
              : isAvailable
                ? "Add to Bag"
                : "Notify When Available"}
        </button>

        <div className="product-detail__actions">
          <WishlistButton productId={product.id} productName={product.name} size="md" />
          <ShareButton
            url={`${typeof window !== "undefined" ? window.location.origin : "https://www.maisonemile.com"}/products/${product.id}`}
            title={product.name}
            text={`${product.name} — ${formatPrice(selectedSku?.salePrice ?? product.minPrice, product.currency)}`}
            label={`Share ${product.name}`}
            size="md"
          />
        </div>

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
        <RecommendationRow productId={product.id} />
      </div>
    </div>
  );
}
