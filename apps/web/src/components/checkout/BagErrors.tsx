/**
 * BagErrors — Renders per-merchant bag-level errors from Violet's 200-with-errors pattern.
 *
 * ## Usage
 * Place inside each bag/merchant section in the checkout layout.
 * Shows inventory issues (out of stock, quantity changes) and price changes
 * with actionable buttons (remove / update quantity).
 *
 * ## UX: Reassurance emotion
 * "We've detected some changes. Here's what you can do."
 * Clear, honest — no vague "something went wrong."
 *
 * @see packages/shared/src/types/cart.types.ts — BagError interface
 * @see Story 4.7 AC#1 — bag-level errors displayed next to merchant section
 */

import type { BagError, CartItem } from "@ecommerce/shared";

interface BagErrorsProps {
  /** Bag errors from Violet's 200-with-errors response */
  errors: BagError[];
  /** Items in this bag (for displaying item names alongside errors) */
  items: CartItem[];
  /** Merchant name for context */
  merchantName: string;
  /** Callback to remove an item by skuId */
  onRemoveItem?: (skuId: string) => void;
  /** Callback to update item quantity */
  onUpdateQuantity?: (skuId: string, quantity: number) => void;
}

export function BagErrors({
  errors,
  items,
  merchantName,
  onRemoveItem,
  onUpdateQuantity,
}: BagErrorsProps) {
  if (errors.length === 0) return null;

  return (
    <div className="bag-error" role="alert" aria-label={`Issues with ${merchantName} items`}>
      <p className="bag-error__heading">Some items from {merchantName} need your attention:</p>

      <ul className="bag-error__list">
        {errors.map((error, idx) => {
          const item = error.skuId ? items.find((i) => i.skuId === error.skuId) : null;
          const isInventoryError =
            error.code === "OUT_OF_STOCK" ||
            error.code === "INSUFFICIENT_QUANTITY" ||
            error.message.toLowerCase().includes("stock");

          return (
            <li
              key={error.skuId ?? idx}
              className={`bag-error__item${isInventoryError ? " bag-error__item--inventory" : ""}`}
            >
              <div className="bag-error__item-info">
                {item && (
                  <span className="bag-error__item-name">{item.name ?? `SKU ${item.skuId}`}</span>
                )}
                <span className="bag-error__item-message">{error.message}</span>
              </div>

              {error.skuId && (
                <div className="bag-error__item-actions">
                  {onUpdateQuantity && !error.message.toLowerCase().includes("out of stock") && (
                    <button
                      type="button"
                      className="bag-error__action bag-error__action--update"
                      onClick={() => onUpdateQuantity(error.skuId!, 1)}
                    >
                      Set to 1
                    </button>
                  )}
                  {onRemoveItem && (
                    <button
                      type="button"
                      className="bag-error__action bag-error__action--remove"
                      onClick={() => onRemoveItem(error.skuId!)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
