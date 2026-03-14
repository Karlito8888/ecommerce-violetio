import { useCartContext } from "../../contexts/CartContext";

/** Displayed when the cart has no items. */
export default function CartEmpty() {
  const { closeDrawer } = useCartContext();

  return (
    <div className="cart-drawer__empty">
      <span className="cart-drawer__empty-icon" aria-hidden="true">
        🛍
      </span>
      <p className="cart-drawer__empty-text">Your bag is empty</p>
      <button
        type="button"
        className="cart-drawer__continue-link"
        onClick={closeDrawer}
        style={{ cursor: "pointer", border: "none", background: "none", padding: 0 }}
      >
        Start shopping
      </button>
    </div>
  );
}
