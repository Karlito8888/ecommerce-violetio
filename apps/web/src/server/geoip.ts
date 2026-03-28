import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { getCountryName } from "@ecommerce/shared";

const COOKIE_NAME = "user_country";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: "/",
  sameSite: "lax" as const,
};

/**
 * Detect user's country from Nginx X-Country-Code header (production only).
 * Sets the user_country cookie if header is present.
 *
 * NOTE: country.is fallback is done CLIENT-SIDE in UserLocationContext because
 * calling it from a server function would resolve the server's IP, not the user's.
 */
export const detectCountryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ countryCode: string | null; countryName: string | null }> => {
    // 1. Check existing cookie first
    const existing = getCookie(COOKIE_NAME);
    if (existing) {
      return { countryCode: existing, countryName: getCountryName(existing) };
    }

    // 2. Nginx geoip_module sets X-Country-Code in production.
    // In local dev without Nginx, this header is absent → returns null.
    // The client-side fallback (country.is) handles local dev detection.

    return { countryCode: null, countryName: null };
  },
);

/**
 * Manually set the user's country (from CountrySelector).
 * Updates the cookie and returns the new country info.
 */
const COUNTRY_CODE_RE = /^[A-Za-z]{2}$/;

export const setCountryFn = createServerFn({ method: "POST" })
  .inputValidator((input: { countryCode: string }) => {
    if (!COUNTRY_CODE_RE.test(input.countryCode)) {
      throw new Error("Invalid country code: must be exactly 2 letters (ISO 3166-1 alpha-2)");
    }
    return input;
  })
  .handler(async ({ data }): Promise<{ countryCode: string; countryName: string }> => {
    const code = data.countryCode.toUpperCase();
    setCookie(COOKIE_NAME, code, COOKIE_OPTIONS);
    return { countryCode: code, countryName: getCountryName(code) ?? code };
  });

/**
 * Read the user_country cookie. Used in root loader for SSR hydration.
 */
export const getCountryCookieFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ countryCode: string | null }> => {
    const code = getCookie(COOKIE_NAME) ?? null;
    return { countryCode: code };
  },
);
