import { Link } from "@tanstack/react-router";

export const FOOTER_SECTIONS: { heading: string; links: { to: string; label: string }[] }[] = [
  {
    heading: "Shop",
    links: [
      { to: "/", label: "New Arrivals" },
      { to: "/", label: "Collections" },
      { to: "/", label: "Gifts" },
      { to: "/", label: "Sale" },
    ],
  },
  {
    heading: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/about", label: "Contact" },
    ],
  },
  {
    heading: "Support",
    links: [
      { to: "/help", label: "FAQ" },
      { to: "/help/contact", label: "Contact" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { to: "/legal/privacy", label: "Privacy Policy" },
      { to: "/legal/terms", label: "Terms of Service" },
      { to: "/legal/cookies", label: "Cookie Preferences" },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="page-wrap site-footer__inner">
        <div className="site-footer__columns">
          {FOOTER_SECTIONS.map(({ heading, links }) => (
            <div key={heading} className="site-footer__section">
              <h3 className="site-footer__heading">{heading}</h3>
              <ul className="site-footer__links">
                {links.map(({ to, label }) => (
                  <li key={label}>
                    <Link to={to} className="site-footer__link">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <nav className="site-footer__social" aria-label="Social media">
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noreferrer"
            className="site-footer__social-link"
            aria-label="Follow us on Instagram"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </a>
          <a
            href="https://pinterest.com"
            target="_blank"
            rel="noreferrer"
            className="site-footer__social-link"
            aria-label="Follow us on Pinterest"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.15 9.42 7.6 11.18-.1-.94-.2-2.38.04-3.4.22-.92 1.4-5.94 1.4-5.94s-.36-.72-.36-1.78c0-1.66.97-2.9 2.17-2.9 1.02 0 1.52.77 1.52 1.7 0 1.03-.66 2.58-1 4.01-.28 1.2.6 2.17 1.78 2.17 2.14 0 3.78-2.26 3.78-5.5 0-2.88-2.07-4.89-5.02-4.89-3.42 0-5.43 2.57-5.43 5.22 0 1.03.4 2.14.9 2.74.1.12.11.22.08.34-.09.38-.3 1.2-.34 1.36-.06.22-.18.27-.42.16-1.56-.73-2.54-3.01-2.54-4.85 0-3.94 2.87-7.56 8.27-7.56 4.34 0 7.71 3.1 7.71 7.23 0 4.32-2.72 7.79-6.5 7.79-1.27 0-2.46-.66-2.87-1.44l-.78 2.98c-.28 1.1-1.05 2.47-1.56 3.31C9.58 23.78 10.76 24 12 24c6.63 0 12-5.37 12-12S18.63 0 12 0z" />
            </svg>
          </a>
        </nav>
      </div>

      <div className="site-footer__disclosure">
        <p>We earn commissions on purchases made through our links. Prices are not affected.</p>
      </div>

      <div className="page-wrap site-footer__bottom">
        <p className="site-footer__copyright">&copy; {year} Maison Émile. All rights reserved.</p>
      </div>
    </footer>
  );
}
