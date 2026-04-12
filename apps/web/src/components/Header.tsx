import { Suspense, useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useUser } from "../hooks/useUser";
import { useCartContext } from "../contexts/CartContext";
import { useUserLocation } from "../contexts/UserLocationContext";
import { useCartQuery, getCartItemCount } from "@ecommerce/shared";
import type { CartFetchFn } from "@ecommerce/shared";
import { getCartFn } from "../server/cartActions";
import ThemeToggle from "./ThemeToggle";
import SearchBar from "./search/SearchBar";
import CountrySelector from "./CountrySelector";

const fetchCart: CartFetchFn = (violetCartId) => getCartFn({ data: violetCartId });

/**
 * Header category navigation links.
 *
 * ## IMPORTANT: `search.category` values MUST match FALLBACK_CATEGORIES filters
 *
 * The `search.category` value is used for two things:
 * 1. Sent as `source_category_name` to Violet's `POST /catalog/offers/search`
 * 2. Compared against CategoryChips filters to highlight the active chip
 *
 * If these values don't match the chip `filter` values in `getProducts.ts`,
 * clicking a header link produces a disconnected UI (no chip highlighted).
 *
 * "New" intentionally has no category filter — shows all products.
 *
 * @see {@link apps/web/src/server/getProducts.ts} FALLBACK_CATEGORIES
 * @see https://docs.violet.io/api-reference/catalog/offers/search-offers
 */
const CATEGORY_LINKS: { to: string; label: string; search?: Record<string, string> }[] = [
  { to: "/products", label: "New" },
  { to: "/products", label: "Fashion", search: { category: "Clothing" } },
  { to: "/products", label: "Home & Living", search: { category: "Home" } },
  { to: "/collections", label: "Collections" },
  { to: "/about", label: "About" },
];

/**
 * Site header with brand, search, account actions, and category navigation.
 *
 * ## Code Review Fix M4 — Wishlist icon auth-gated
 * AC #8 requires: "the wishlist heart icon is NOT shown" for anonymous/guest users.
 * Previously the wishlist icon was rendered unconditionally. Now it checks
 * `useUser()` and only renders for authenticated (non-anonymous) users.
 * Guests see account + cart icons only, matching the spec.
 */
export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: user } = useUser();
  const isAuthenticated = !!user && !user.is_anonymous;

  return (
    <header className="site-header">
      <div className="page-wrap site-header__inner">
        <Link to="/" className="site-header__brand">
          <span className="site-header__logo display-title">Maison Émile</span>
        </Link>

        <div className="site-header__search">
          <SearchBar variant="compact" />
        </div>

        <Link
          to="/search"
          search={{
            q: undefined,
            category: undefined,
            minPrice: undefined,
            maxPrice: undefined,
            inStock: undefined,
          }}
          className="site-header__search-mobile"
          aria-label="Search"
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </Link>

        <nav className="site-header__actions" aria-label="Account actions">
          <Link
            to="/auth/login"
            search={{ redirect: "/" }}
            className="site-header__account"
            aria-label="Account"
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </Link>
          {/* Wishlist icon — only for authenticated users (AC #8, Code Review Fix M4) */}
          {isAuthenticated && (
            <Link to="/account/wishlist" className="site-header__wishlist" aria-label="Wishlist">
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </Link>
          )}
          <CartButton />
          <CountryButton />
          <ThemeToggle />
        </nav>

        <button
          type="button"
          className="site-header__menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {menuOpen ? (
              <>
                <path d="M18 6 6 18" />
                <path d="M6 6l12 12" />
              </>
            ) : (
              <>
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </>
            )}
          </svg>
        </button>
      </div>

      <nav
        id="main-nav"
        className={`page-wrap site-header__categories${menuOpen ? " site-header__categories--open" : ""}`}
        aria-label="Main navigation"
      >
        {CATEGORY_LINKS.map(({ to, label, search }) => (
          <Link
            key={label}
            to={to}
            search={search}
            className="nav-link"
            activeProps={{ className: "is-active" }}
            activeOptions={{ exact: true }}
            onClick={() => setMenuOpen(false)}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/**
 * Country selector button — shows current country flag or globe icon.
 * Opens CountrySelector popover on click.
 */
function CountryButton() {
  const { countryCode, countryFlagEmoji, setCountry } = useUserLocation();
  const [isOpen, setIsOpen] = useState(false);
  const handleClose = useCallback(() => setIsOpen(false), []);

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="site-header__country"
        aria-label={countryCode ? `Country: ${countryCode}` : "Select country"}
        onClick={() => setIsOpen(!isOpen)}
      >
        {countryFlagEmoji || (
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        )}
      </button>
      {isOpen && (
        <Suspense fallback={null}>
          <CountrySelector
            isOpen={isOpen}
            onClose={handleClose}
            onSelect={setCountry}
            currentCountryCode={countryCode}
          />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Cart icon button with item count badge.
 * Opens the cart drawer on click instead of navigating.
 */
function CartButton() {
  const { violetCartId, openDrawer } = useCartContext();
  const { data: cartResponse } = useCartQuery(violetCartId, fetchCart);
  const itemCount = getCartItemCount(cartResponse?.data ?? null);

  return (
    <button
      type="button"
      className="site-header__cart"
      aria-label={itemCount > 0 ? `Cart (${itemCount} items)` : "Cart"}
      onClick={openDrawer}
    >
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
      {itemCount > 0 && <span className="site-header__cart-badge">{itemCount}</span>}
    </button>
  );
}
