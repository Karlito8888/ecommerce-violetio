/**
 * InventoryAlert — Pre-submit inventory validation failure overlay.
 *
 * Shows which items are unavailable or have reduced stock at checkout submission.
 * The user must resolve all issues before the order can be submitted.
 *
 * @see Story 4.7 AC#1 — FR18: inventory validation failures with remove/update options
 */

import type { Bag } from "@ecommerce/shared";

interface InventoryAlertProps {
  /** Bags with inventory issues (only bags with errors) */
  bags: Bag[];
  /** Called when user removes an item */
  onRemoveItem: (skuId: string) => void;
  /** Called when user updates quantity */
  onUpdateQuantity: (skuId: string, quantity: number) => void;
  /** Called when user dismisses the alert to re-validate */
  onDismiss: () => void;
  /** Whether a re-validation is in progress */
  isRevalidating: boolean;
}

export function InventoryAlert({
  bags,
  onRemoveItem,
  onUpdateQuantity,
  onDismiss,
  isRevalidating,
}: InventoryAlertProps) {
  const bagsWithErrors = bags.filter((bag) => bag.errors.length > 0);

  if (bagsWithErrors.length === 0) return null;

  return (
    <div className="inventory-alert" role="alertdialog" aria-label="Inventory issues detected">
      <div className="inventory-alert__content">
        <h3 className="inventory-alert__title">Some items need your attention</h3>
        <p className="inventory-alert__description">
          We checked your cart before checkout and found some changes. Please review and update your
          items to continue.
        </p>

        {bagsWithErrors.map((bag) => (
          <div key={bag.id} className="inventory-alert__bag">
            <p className="inventory-alert__merchant">{bag.merchantName}</p>
            <ul className="inventory-alert__items">
              {bag.errors.map((error, idx) => {
                const item = error.skuId ? bag.items.find((i) => i.skuId === error.skuId) : null;
                const isOutOfStock = error.message.toLowerCase().includes("out of stock");

                return (
                  <li
                    key={error.skuId ?? idx}
                    className={`inventory-alert__item${isOutOfStock ? " inventory-alert__item--unavailable" : " inventory-alert__item--reduced"}`}
                  >
                    <div className="inventory-alert__item-info">
                      <span className="inventory-alert__item-name">
                        {item?.name ?? `SKU ${error.skuId ?? "unknown"}`}
                      </span>
                      <span className="inventory-alert__item-status">{error.message}</span>
                    </div>
                    <div className="inventory-alert__item-actions">
                      {!isOutOfStock && (
                        <button
                          type="button"
                          className="inventory-alert__action inventory-alert__action--update"
                          onClick={() => error.skuId && onUpdateQuantity(error.skuId, 1)}
                          disabled={isRevalidating}
                        >
                          Update qty
                        </button>
                      )}
                      <button
                        type="button"
                        className="inventory-alert__action inventory-alert__action--remove"
                        onClick={() => error.skuId && onRemoveItem(error.skuId)}
                        disabled={isRevalidating}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <button
          type="button"
          className="inventory-alert__continue"
          onClick={onDismiss}
          disabled={isRevalidating}
        >
          {isRevalidating ? "Checking cart…" : "Continue to checkout"}
        </button>
      </div>
    </div>
  );
}
