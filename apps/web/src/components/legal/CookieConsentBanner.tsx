import { useEffect, useRef, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useCookieConsent } from "../../hooks/useCookieConsent";

/**
 * CookieConsentBanner — GDPR-compliant cookie consent dialog.
 *
 * Design decisions:
 * - Equal-weight Accept/Decline buttons (no dark patterns, GDPR compliance)
 * - Focus trap prevents keyboard users from interacting with page behind banner
 * - `role="dialog"` + `aria-label` for screen reader identification
 * - `aria-modal="true"` signals modal behavior to assistive tech
 * - Auto-focuses on mount to ensure keyboard users encounter the banner
 * - Consent stored in localStorage (no third-party cookies)
 */
export default function CookieConsentBanner() {
  const { hasChosen, accept, decline } = useCookieConsent();
  const bannerRef = useRef<HTMLDivElement>(null);

  /**
   * Focus trap handler — keeps Tab/Shift+Tab cycling within the banner.
   * This prevents keyboard users from accidentally interacting with the page
   * behind the consent dialog, matching the `aria-modal="true"` semantic.
   */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const banner = bannerRef.current;
    if (!banner) return;

    const focusable = banner.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // Focus the banner when it first appears and attach focus trap
  useEffect(() => {
    if (!hasChosen && bannerRef.current) {
      bannerRef.current.focus();
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [hasChosen, handleKeyDown]);

  if (hasChosen) return null;

  return (
    <div
      ref={bannerRef}
      className="cookie-consent"
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="true"
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
