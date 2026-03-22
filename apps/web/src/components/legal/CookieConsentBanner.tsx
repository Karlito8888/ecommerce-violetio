import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useCookieConsent } from "../../hooks/useCookieConsent";

/**
 * GDPR cookie consent banner — shown once on first visit until user accepts or declines.
 *
 * Anti-dark-pattern design (per UX spec):
 * - Accept and Decline buttons have identical visual weight (same size, same style)
 * - No pre-checked boxes
 * - Banner is minimal and non-intrusive
 * - Declining is just as easy as accepting
 */
export default function CookieConsentBanner() {
  const { hasChosen, accept, decline } = useCookieConsent();
  const bannerRef = useRef<HTMLDivElement>(null);

  // Focus the banner when it first appears for accessibility
  useEffect(() => {
    if (!hasChosen && bannerRef.current) {
      bannerRef.current.focus();
    }
  }, [hasChosen]);

  if (hasChosen) return null;

  return (
    <div
      ref={bannerRef}
      className="cookie-consent"
      role="dialog"
      aria-label="Cookie consent"
      tabIndex={-1}
    >
      <div className="cookie-consent__inner">
        <p className="cookie-consent__text">
          We use cookies for authentication and to remember your preferences. No tracking cookies
          are used.{" "}
          <Link to="/legal/$slug" params={{ slug: "cookies" }} className="cookie-consent__link">
            Learn more
          </Link>
        </p>
        <div className="cookie-consent__actions">
          <button type="button" className="cookie-consent__btn" onClick={decline}>
            Decline
          </button>
          <button type="button" className="cookie-consent__btn" onClick={accept}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
