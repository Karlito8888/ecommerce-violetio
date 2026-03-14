import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useCartContext } from "../../contexts/CartContext";
import {
  useCartQuery,
  useUpdateCartItem,
  useRemoveFromCart,
  getCartItemCount,
} from "@ecommerce/shared";
import type { CartFetchFn, UpdateCartItemFn, RemoveFromCartFn } from "@ecommerce/shared";
import CartBag from "./CartBag";
import CartEmpty from "./CartEmpty";

/** Formats an integer cent value to a dollar string. */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

interface CartDrawerProps {
  fetchCartFn: CartFetchFn;
  updateCartItemFn: UpdateCartItemFn;
  removeFromCartFn: RemoveFromCartFn;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Cart Drawer — slide-in panel from the right (AC: #8).
 *
 * ## Accessibility
 * - `role="dialog"` + `aria-modal="true"` signals modal context to screen readers
 * - `aria-label="Shopping bag"` provides a meaningful label
 * - Focus trap keeps keyboard navigation inside the drawer while open
 * - Escape key closes the drawer
 * - `aria-live="polite"` on price region announces quantity/price changes
 *
 * ## Close triggers (AC: #8)
 * - ✕ button in header
 * - Overlay click
 * - Escape key
 * - "Continue Shopping" link
 */
export default function CartDrawer({
  fetchCartFn,
  updateCartItemFn,
  removeFromCartFn,
}: CartDrawerProps) {
  const { violetCartId, isDrawerOpen, closeDrawer } = useCartContext();
  const drawerRef = useRef<HTMLDivElement>(null);

  // ── Data ────────────────────────────────────────────────────────────
  const { data: cartResponse } = useCartQuery(violetCartId, fetchCartFn);
  const cart = cartResponse?.data ?? null;
  const itemCount = getCartItemCount(cart);

  const updateMutation = useUpdateCartItem(updateCartItemFn);
  const removeMutation = useRemoveFromCart(removeFromCartFn);

  const isUpdating = updateMutation.isPending || removeMutation.isPending;

  // ── Handlers ────────────────────────────────────────────────────────
  const handleUpdateQty = (skuId: string, quantity: number) => {
    if (!violetCartId) return;
    updateMutation.mutate({ violetCartId, skuId, quantity });
  };

  const handleRemove = (skuId: string) => {
    if (!violetCartId) return;
    removeMutation.mutate({ violetCartId, skuId });
  };

  // ── Keyboard: Escape to close ───────────────────────────────────────
  useEffect(() => {
    if (!isDrawerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer();
        return;
      }

      // Focus trap — keep Tab/Shift+Tab inside the drawer
      if (e.key === "Tab" && drawerRef.current) {
        const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen, closeDrawer]);

  // ── Focus management — move focus into drawer when it opens ─────────
  useEffect(() => {
    if (isDrawerOpen && drawerRef.current) {
      const firstFocusable = drawerRef.current.querySelector<HTMLElement>(FOCUSABLE);
      firstFocusable?.focus();
    }
  }, [isDrawerOpen]);

  // ── Body scroll lock ─────────────────────────────────────────────────
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDrawerOpen]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`cart-drawer__overlay${isDrawerOpen ? " cart-drawer__overlay--visible" : ""}`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        className={`cart-drawer${isDrawerOpen ? " cart-drawer--open" : ""}`}
        aria-hidden={!isDrawerOpen}
      >
        {/* Header */}
        <div className="cart-drawer__header">
          <h2 className="cart-drawer__title">
            Shopping Bag{itemCount > 0 ? ` (${itemCount})` : ""}
          </h2>
          <button
            type="button"
            className="cart-drawer__close"
            onClick={closeDrawer}
            aria-label="Close shopping bag"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="cart-drawer__body">
          {/* aria-live region for price updates */}
          <div aria-live="polite" className="cart-drawer__price-live">
            {cart ? `Total: ${formatCents(cart.total)}` : ""}
          </div>

          {!cart || cart.bags.length === 0 ? (
            <CartEmpty />
          ) : (
            cart.bags.map((bag) => (
              <CartBag
                key={bag.id}
                bag={bag}
                onUpdateQty={handleUpdateQty}
                onRemove={handleRemove}
                isUpdating={isUpdating}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {cart && cart.bags.length > 0 && (
          <div className="cart-drawer__footer">
            <div className="cart-drawer__summary">
              <div className="cart-drawer__total">
                <span>Total</span>
                <span>{formatCents(cart.total)}</span>
              </div>
            </div>

            <div className="cart-drawer__actions">
              <Link
                to="/checkout"
                onClick={closeDrawer}
                className="cart-drawer__checkout-btn"
                style={{ display: "block", textAlign: "center", textDecoration: "none" }}
              >
                Proceed to Checkout
              </Link>
              <Link to="/cart" onClick={closeDrawer} className="cart-drawer__view-cart-link">
                View Full Cart
              </Link>
              <button type="button" className="cart-drawer__continue-link" onClick={closeDrawer}>
                Continue Shopping
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
