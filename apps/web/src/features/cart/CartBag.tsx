// Using shared formatPrice to avoid duplication — see packages/shared/src/utils/formatPrice.ts
import { formatPrice } from "@ecommerce/shared";
import type { Bag } from "@ecommerce/shared";
import CartItem from "./CartItem";

interface CartBagProps {
  bag: Bag;
  onUpdateQty: (skuId: string, quantity: number) => void;
  onRemove: (skuId: string) => void;
  isUpdating?: boolean;
}

/**
 * Merchant bag wrapper — groups items from one merchant within the cart drawer.
 *
 * Violet manages bag grouping automatically; we just render what they return.
 * Shows per-bag errors from the Violet 200-with-errors pattern (AC: #12).
 */
export default function CartBag({ bag, onUpdateQty, onRemove, isUpdating }: CartBagProps) {
  return (
    <div className="cart-drawer__bag">
      <p className="cart-drawer__bag-merchant">
        {bag.merchantName || `Merchant ${bag.merchantId}`}
      </p>

      {bag.errors.length > 0 && (
        <div className="cart-drawer__bag-errors" role="alert">
          {bag.errors.map((err, i) => (
            <p key={i} className="cart-drawer__bag-error">
              {err.message}
            </p>
          ))}
        </div>
      )}

      {bag.items.map((item) => (
        <CartItem
          key={item.skuId}
          item={item}
          onUpdateQty={onUpdateQty}
          onRemove={onRemove}
          isUpdating={isUpdating}
        />
      ))}

      <div className="cart-drawer__bag-subtotal">
        <span>Subtotal</span>
        <span>{formatPrice(bag.subtotal)}</span>
      </div>
      <div className="cart-drawer__bag-tax">
        <span>Est. Tax</span>
        <span>{formatPrice(bag.tax)}</span>
      </div>
      <div className="cart-drawer__bag-shipping">
        <span>Est. Shipping</span>
        <span>
          {bag.shippingTotal > 0 ? formatPrice(bag.shippingTotal) : "Calculated at checkout"}
        </span>
      </div>
    </div>
  );
}
