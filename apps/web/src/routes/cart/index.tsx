import { createFileRoute, Link } from "@tanstack/react-router";
import { useCartContext } from "../../contexts/CartContext";
import { useCartQuery, getCartItemCount } from "@ecommerce/shared";
import { getCartFn, updateCartItemFn, removeFromCartFn } from "../../server/cartActions";
import type { CartFetchFn, UpdateCartItemFn, RemoveFromCartFn } from "@ecommerce/shared";
import CartBag from "../../features/cart/CartBag";
import CartEmpty from "../../features/cart/CartEmpty";
import { useUpdateCartItem, useRemoveFromCart } from "@ecommerce/shared";

const fetchCart: CartFetchFn = (violetCartId) => getCartFn({ data: violetCartId });
const updateCartItem: UpdateCartItemFn = (input) => updateCartItemFn({ data: input });
const removeFromCart: RemoveFromCartFn = (input) => removeFromCartFn({ data: input });

/** Formats an integer cent value to a dollar string. */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * /cart — Full cart page (CSR only — no loader, per architecture.md#SSR strategy).
 *
 * This is the expanded view of the cart with all items, merchant bags,
 * and a prominent checkout CTA. The cart drawer is a quick-access preview;
 * this page is the full cart management experience.
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

  return (
    <div className="page-wrap">
      <div className="cart-page">
        <h1 className="cart-page__title">Your Bag{itemCount > 0 ? ` (${itemCount})` : ""}</h1>

        {isLoading ? (
          <p>Loading your bag…</p>
        ) : !cart || cart.bags.length === 0 ? (
          <CartEmpty />
        ) : (
          <div className="cart-page__layout">
            <div className="cart-page__items">
              {cart.bags.map((bag) => (
                <CartBag
                  key={bag.id}
                  bag={bag}
                  onUpdateQty={handleUpdateQty}
                  onRemove={handleRemove}
                  isUpdating={isUpdating}
                />
              ))}
            </div>

            <div className="cart-page__summary">
              <div className="cart-page__total">
                <span>Total</span>
                <strong>{formatCents(cart.total)}</strong>
              </div>
              <Link
                to="/"
                className="cart-page__checkout-btn"
                style={{ display: "block", textAlign: "center", textDecoration: "none" }}
              >
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
                className="cart-page__continue-link"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
