import { createFileRoute, Link } from "@tanstack/react-router";
import { useCartContext } from "../../contexts/CartContext";
// Using shared formatPrice to avoid duplication — see packages/shared/src/utils/formatPrice.ts
import {
  useCartQuery,
  getCartItemCount,
  useUpdateCartItem,
  useRemoveFromCart,
  formatPrice,
} from "@ecommerce/shared";
import { getCartFn, updateCartItemFn, removeFromCartFn } from "../../server/cartActions";
import type { CartFetchFn, UpdateCartItemFn, RemoveFromCartFn } from "@ecommerce/shared";
import CartEmpty from "../../features/cart/CartEmpty";

const fetchCart: CartFetchFn = (violetCartId) => getCartFn({ data: violetCartId });
const updateCartItem: UpdateCartItemFn = (input) => updateCartItemFn({ data: input });
const removeFromCart: RemoveFromCartFn = (input) => removeFromCartFn({ data: input });

/**
 * /cart — Full cart page (CSR only — no loader, per architecture.md#SSR strategy).
 *
 * Two-column layout: items grouped by merchant bag (left) + pricing summary sidebar (right).
 * Uses .cart BEM block (distinct from .cart-drawer used by the drawer panel).
 */
export const Route = createFileRoute("/cart/")({
  component: CartPage,
});

function CartPage() {
  const { violetCartId } = useCartContext();
  const { data: cartResponse, isLoading } = useCartQuery(violetCartId, fetchCart);
  const cart = cartResponse?.data ?? null;
  const itemCount = getCartItemCount(cart);

  const updateMutation = useUpdateCartItem(updateCartItem);
  const removeMutation = useRemoveFromCart(removeFromCart);
  const isUpdating = updateMutation.isPending || removeMutation.isPending;

  const handleUpdateQty = (skuId: string, quantity: number) => {
    if (!violetCartId) return;
    updateMutation.mutate({ violetCartId, skuId, quantity });
  };

  const handleRemove = (skuId: string) => {
    if (!violetCartId) return;
    removeMutation.mutate({ violetCartId, skuId });
  };

  // Aggregate totals across all bags for the sidebar summary
  const subtotalAll = cart?.bags.reduce((sum, b) => sum + b.subtotal, 0) ?? 0;
  const taxAll = cart?.bags.reduce((sum, b) => sum + b.tax, 0) ?? 0;
  const shippingAll = cart?.bags.reduce((sum, b) => sum + b.shippingTotal, 0) ?? 0;

  return (
    <div className="page-wrap">
      <div className="cart">
        <h1 className="cart__title">Your Bag{itemCount > 0 ? ` (${itemCount})` : ""}</h1>

        {isLoading ? (
          <p>Loading your bag…</p>
        ) : !cart || cart.bags.length === 0 ? (
          <CartEmpty />
        ) : (
          <div className="cart__layout">
            {/* Left column — items grouped by merchant bag */}
            <div className="cart__items">
              {cart.bags.map((bag) => (
                <div key={bag.id} className="cart__bag">
                  <p className="cart__bag-merchant">
                    {bag.merchantName || `Merchant ${bag.merchantId}`}
                  </p>

                  {bag.items.map((item) => (
                    <div
                      key={item.skuId}
                      className={`cart__item${!item.thumbnailUrl ? " cart__item--no-thumbnail" : ""}`}
                    >
                      {item.thumbnailUrl && (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.name ?? `SKU ${item.skuId}`}
                          className="cart__item-thumbnail"
                          width={56}
                          height={56}
                        />
                      )}
                      <div className="cart__item-info">
                        <p className="cart__item-name">{item.name ?? `SKU ${item.skuId}`}</p>
                        <p className="cart__item-price">
                          {formatPrice(item.unitPrice)} × {item.quantity} ={" "}
                          <strong>{formatPrice(item.unitPrice * item.quantity)}</strong>
                        </p>
                      </div>
                      <div className="cart__item-controls">
                        <button
                          type="button"
                          disabled={item.quantity <= 1 || isUpdating}
                          onClick={() => handleUpdateQty(item.skuId, item.quantity - 1)}
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleUpdateQty(item.skuId, item.quantity + 1)}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(item.skuId)}
                          aria-label={`Remove ${item.name ?? item.skuId} from cart`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Per-bag pricing breakdown (AC: #3, #4, #5) */}
                  <div className="cart__bag-pricing">
                    <div className="cart__bag-row cart__bag-row--subtotal">
                      <span>Subtotal</span>
                      <span>{formatPrice(bag.subtotal)}</span>
                    </div>
                    <div className="cart__bag-row">
                      <span>Est. Tax</span>
                      <span>{formatPrice(bag.tax)}</span>
                    </div>
                    <div className="cart__bag-row">
                      <span>Est. Shipping</span>
                      <span>
                        {bag.shippingTotal > 0
                          ? formatPrice(bag.shippingTotal)
                          : "Calculated at checkout"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Right sidebar — aggregated pricing summary */}
            <div className="cart__summary">
              <div className="cart__summary-row">
                <span>Subtotal</span>
                <span>{formatPrice(subtotalAll)}</span>
              </div>
              <div className="cart__summary-row">
                <span>Est. Tax</span>
                <span>{formatPrice(taxAll)}</span>
              </div>
              <div className="cart__summary-row">
                <span>Est. Shipping</span>
                <span>{shippingAll > 0 ? formatPrice(shippingAll) : "Calculated at checkout"}</span>
              </div>
              <div className="cart__summary-total">
                <span>Total</span>
                <span>{formatPrice(cart.total)}</span>
              </div>
              <Link to="/checkout" className="cart__checkout-btn">
                Proceed to Checkout
              </Link>
              <Link
                to="/products"
                search={{
                  category: undefined,
                  minPrice: undefined,
                  maxPrice: undefined,
                  inStock: undefined,
                  sortBy: undefined,
                  sortDirection: undefined,
                }}
                className="cart__continue-link"
              >
                Continue Shopping
              </Link>
              <p className="cart__affiliate">
                We earn a commission on purchases — this doesn&apos;t affect the price you pay.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
