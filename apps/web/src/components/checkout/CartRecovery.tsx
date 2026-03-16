/**
 * CartRecovery — Displays when cart is in an unhealthy state (stale/expired/invalid).
 *
 * ## States
 * - `stale`: auto-recovering, shows spinner
 * - `expired`: Violet cart gone, user must start fresh
 * - `invalid`: unexpected state, user must start fresh
 *
 * ## UX: Reassurance emotion
 * "Your cart session has expired" — honest, no panic.
 *
 * @see Story 4.7 AC#2 — cart recovery for expired/invalid carts
 */

import type { CartHealthStatus } from "@ecommerce/shared";

interface CartRecoveryProps {
  cartHealth: CartHealthStatus;
  onStartFresh: () => void;
  onRetry: () => void;
}

export function CartRecovery({ cartHealth, onStartFresh, onRetry }: CartRecoveryProps) {
  if (cartHealth === "healthy") return null;

  if (cartHealth === "stale") {
    return (
      <div className="cart-recovery cart-recovery--stale" role="status" aria-live="polite">
        <div className="cart-recovery__spinner" />
        <p className="cart-recovery__message">Refreshing your cart…</p>
      </div>
    );
  }

  return (
    <div
      className="cart-recovery cart-recovery--expired"
      role="alertdialog"
      aria-label="Cart session expired"
    >
      <div className="cart-recovery__content">
        {/**
         * ## No vague "something went wrong" (Code Review Fix — L1)
         * The UX spec mandates Reassurance emotion: "clear, honest messaging —
         * no vague 'something went wrong'". The `invalid` state now has a specific
         * message that acknowledges the issue without causing panic.
         */}
        <h3 className="cart-recovery__title">
          {cartHealth === "expired"
            ? "Your cart session has expired"
            : "We encountered an unexpected issue with your cart"}
        </h3>
        <p className="cart-recovery__description">
          {cartHealth === "expired"
            ? "Your items may have changed since your last visit. You can start a fresh cart to continue shopping."
            : "Your cart data may be out of sync. You can try refreshing, or start a new cart — your previous items won't be lost if you're signed in."}
        </p>
        <div className="cart-recovery__actions">
          <button
            type="button"
            className="cart-recovery__action cart-recovery__action--primary"
            onClick={onStartFresh}
          >
            Start Fresh
          </button>
          {cartHealth === "invalid" && (
            <button
              type="button"
              className="cart-recovery__action cart-recovery__action--secondary"
              onClick={onRetry}
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
