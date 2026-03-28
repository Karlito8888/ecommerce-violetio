import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { countryFlag, getCountryName } from "@ecommerce/shared";
import { detectCountryFn, setCountryFn } from "../server/geoip";

/**
 * UserLocationContext — manages the user's country for geo-filtered catalog and delivery estimates.
 *
 * ## Design decisions
 *
 * - **React Context**: follows the CartContext pattern — simple state (country code + name),
 *   no need for an external store.
 * - **Server-side hydration**: Provider accepts `initialCountryCode` from the root loader
 *   (which reads the `user_country` HttpOnly cookie). Country is available immediately on SSR.
 * - **Auto-detection**: If no cookie exists on mount, triggers `detectCountryFn` client-side
 *   (calls country.is API via server function).
 * - **Cookie persistence**: Country changes via `setCountry()` call `setCountryFn` which
 *   updates the HttpOnly cookie server-side.
 *
 * @see apps/web/src/server/geoip.ts — server functions for detection + cookie management
 * @see apps/web/src/routes/__root.tsx — loader reads cookie, passes initialCountryCode
 */

interface UserLocationContextValue {
  countryCode: string | null;
  countryName: string | null;
  countryFlagEmoji: string;
  setCountry: (code: string) => void;
  isDetecting: boolean;
}

const UserLocationContext = createContext<UserLocationContextValue | null>(null);

export function useUserLocation(): UserLocationContextValue {
  const ctx = useContext(UserLocationContext);
  if (!ctx) {
    throw new Error("useUserLocation must be used within a UserLocationProvider");
  }
  return ctx;
}

/** Safe version — returns null outside provider instead of throwing. */
export function useUserLocationSafe(): UserLocationContextValue | null {
  return useContext(UserLocationContext);
}

interface UserLocationProviderProps {
  initialCountryCode: string | null;
  children: React.ReactNode;
}

export default function UserLocationProvider({
  initialCountryCode,
  children,
}: UserLocationProviderProps) {
  const [countryCode, setCountryCode] = useState<string | null>(initialCountryCode);
  const [isDetecting, setIsDetecting] = useState(false);
  const detectionRan = useRef(false);

  // Auto-detect country on mount if no cookie was found.
  // Uses a ref to ensure detection runs exactly once, even with React strict mode.
  // 1. Try server function (reads Nginx X-Country-Code header in production)
  // 2. Fallback: call country.is from the BROWSER (so it sees the user's IP, not server's)
  useEffect(() => {
    if (initialCountryCode || detectionRan.current) return;
    detectionRan.current = true;

    let cancelled = false;
    setIsDetecting(true);

    (async () => {
      // Step 1: Check server (Nginx header / existing cookie)
      const serverResult = await detectCountryFn();
      if (!cancelled && serverResult.countryCode) {
        setCountryCode(serverResult.countryCode);
        setIsDetecting(false);
        return;
      }

      // Step 2: Client-side fallback — country.is sees the user's real IP
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch("https://api.country.is", {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = (await response.json()) as { country?: string };
          if (!cancelled && data.country) {
            const code = data.country.toUpperCase();
            setCountryCode(code);
            // Persist to cookie via server function
            setCountryFn({ data: { countryCode: code } });
          }
        }
      } catch {
        // country.is down or timeout — leave country as null (show "Select country")
      }

      if (!cancelled) setIsDetecting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setCountry = useCallback((code: string) => {
    const upper = code.toUpperCase();
    setCountryCode(upper);
    // Persist to cookie via server function (fire and forget)
    setCountryFn({ data: { countryCode: upper } });
  }, []);

  const value = useMemo(
    (): UserLocationContextValue => ({
      countryCode,
      countryName: getCountryName(countryCode),
      countryFlagEmoji: countryCode ? countryFlag(countryCode) : "",
      setCountry,
      isDetecting,
    }),
    [countryCode, setCountry, isDetecting],
  );

  return <UserLocationContext.Provider value={value}>{children}</UserLocationContext.Provider>;
}
