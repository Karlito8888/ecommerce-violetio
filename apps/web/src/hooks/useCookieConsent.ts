/**
 * @module useCookieConsent
 *
 * React hook for managing GDPR cookie consent state via localStorage.
 *
 * Design decisions:
 * - Initializes to `null` on both server and client to prevent hydration mismatch.
 *   localStorage is read in a `useEffect` after mount.
 * - Since the platform only uses functional cookies (Supabase auth session),
 *   the consent banner is informational for GDPR compliance — auth cookies are
 *   exempt as strictly necessary. No behavior changes based on accept/decline.
 * - Returns a stable `accept`/`decline` callback pair via `useCallback` to avoid
 *   unnecessary re-renders in consuming components.
 */

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "cookie-consent";

export type CookieConsentValue = "accepted" | "declined" | null;

export interface UseCookieConsentReturn {
  consent: CookieConsentValue;
  accept: () => void;
  decline: () => void;
  hasChosen: boolean;
}

/**
 * Manages cookie consent state via localStorage.
 * Returns null on first visit (banner should show), "accepted" or "declined" after choice.
 *
 * NOTE: Since the platform only uses functional cookies (Supabase auth session),
 * the consent banner is informational for GDPR compliance — auth cookies are
 * exempt as strictly necessary. No behavior changes based on accept/decline.
 */
export function useCookieConsent(): UseCookieConsentReturn {
  // Always start null so server and client render the same initial HTML (no hydration mismatch).
  // localStorage is read in useEffect after mount.
  const [consent, setConsent] = useState<CookieConsentValue>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "accepted" || stored === "declined") {
      setConsent(stored);
    }
  }, []);

  const accept = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setConsent("accepted");
  }, []);

  const decline = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "declined");
    setConsent("declined");
  }, []);

  return {
    consent,
    accept,
    decline,
    hasChosen: consent !== null,
  };
}
