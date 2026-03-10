import { useState } from "react";
import { Link } from "@tanstack/react-router";
import ThemeToggle from "./ThemeToggle";

const CATEGORY_LINKS: { to: string; label: string }[] = [
  { to: "/", label: "New" },
  { to: "/", label: "Collections" },
  { to: "/", label: "Gifts" },
  { to: "/", label: "Sale" },
  { to: "/about", label: "About" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="page-wrap site-header__inner">
        <Link to="/" className="site-header__brand">
          <span className="site-header__logo display-title">Maison Émile</span>
        </Link>

        <div className="site-header__search">
          <label htmlFor="header-search" className="sr-only">
            Search
          </label>
          <input
            id="header-search"
            type="search"
            className="site-header__search-input"
            placeholder="What are you looking for?"
            aria-label="Search products"
          />
        </div>

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
          {/* TODO(Epic-4): Change to="/cart" when cart route exists */}
          <Link to="/" className="site-header__cart" aria-label="Cart">
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
          </Link>
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
        {CATEGORY_LINKS.map(({ to, label }) => (
          <Link
            key={label}
            to={to}
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
