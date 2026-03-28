import { useState } from "react";
// Using shared formatPrice to avoid duplication — see packages/shared/src/utils/formatPrice.ts
import { formatPrice } from "@ecommerce/shared";
import type { CartItem as CartItemType } from "@ecommerce/shared";

interface CartItemProps {
  item: CartItemType;
  onUpdateQty: (orderSkuId: string, skuId: string, quantity: number) => void;
  onRemove: (orderSkuId: string, skuId: string) => void;
  isUpdating?: boolean;
}

/**
 * Single item row in the cart drawer.
 *
 * Handles quantity adjustment (+/-) and remove action.
 * Shows 150ms fade-out animation on remove (AC: #8).
 */
export default function CartItem({ item, onUpdateQty, onRemove, isUpdating }: CartItemProps) {
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = () => {
    setIsRemoving(true);
    // Allow CSS animation to play before removing from DOM
    setTimeout(() => onRemove(item.id, item.skuId), 150);
  };

  const lineTotal = item.unitPrice * item.quantity;

  return (
    <div
      className={`cart-drawer__item${isRemoving ? " cart-drawer__item--removing" : ""}${item.thumbnailUrl ? " cart-drawer__item--with-thumbnail" : ""}`}
    >
      {item.thumbnailUrl && (
        <img
          src={item.thumbnailUrl}
          alt={item.name ?? `SKU ${item.skuId}`}
          className="cart-drawer__item-thumbnail"
          width={40}
          height={40}
        />
      )}
      <div className="cart-drawer__item-info">
        <p className="cart-drawer__item-name">{item.name ?? `SKU ${item.skuId}`}</p>
        <p className="cart-drawer__item-price">
          {formatPrice(item.unitPrice)} × {item.quantity} ={" "}
          <strong>{formatPrice(lineTotal)}</strong>
        </p>
      </div>

      <div className="cart-drawer__item-controls">
        <div className="cart-drawer__qty" role="group" aria-label="Item quantity">
          <button
            type="button"
            className="cart-drawer__qty-btn"
            aria-label="Decrease quantity"
            disabled={item.quantity <= 1 || isUpdating}
            onClick={() => onUpdateQty(item.id, item.skuId, item.quantity - 1)}
          >
            −
          </button>
          <span className="cart-drawer__qty-value">{item.quantity}</span>
          <button
            type="button"
            className="cart-drawer__qty-btn"
            aria-label="Increase quantity"
            disabled={isUpdating}
            onClick={() => onUpdateQty(item.id, item.skuId, item.quantity + 1)}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="cart-drawer__remove-btn"
          onClick={handleRemove}
          aria-label={`Remove item ${item.skuId} from cart`}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
