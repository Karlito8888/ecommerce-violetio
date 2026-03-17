/**
 * Deep link URL mapping utility.
 *
 * Maps web URLs (maisonemile.com) to mobile app paths (Expo Router)
 * and push notification payloads to mobile paths.
 *
 * Pure TypeScript — zero dependencies. Safe for both web and mobile.
 */

export interface RouteMapping {
  /** Regex matching the web URL pathname */
  webPattern: RegExp;
  /** Convert regex match groups to a mobile path */
  toMobilePath: (matches: RegExpMatchArray) => string;
}

/**
 * Ordered mapping table: web URL pathname → mobile app path.
 * More specific patterns must appear before general ones.
 */
export const ROUTE_MAPPINGS: RouteMapping[] = [
  // Product detail: /products/:id → /products/:id
  {
    webPattern: /^\/products\/([^/]+)$/,
    toMobilePath: (m) => `/products/${m[1]}`,
  },
  // Order confirmation: /order/:id/confirmation → /order/:id/confirmation
  {
    webPattern: /^\/order\/([^/]+)\/confirmation$/,
    toMobilePath: (m) => `/order/${m[1]}/confirmation`,
  },
  // Order lookup: /order/lookup → /order/lookup
  {
    webPattern: /^\/order\/lookup$/,
    toMobilePath: () => "/order/lookup",
  },
  // Account order detail: /account/orders/:id → /order/:id/confirmation
  {
    webPattern: /^\/account\/orders\/([^/]+)$/,
    toMobilePath: (m) => `/order/${m[1]}/confirmation`,
  },
  // Account orders list: /account/orders → /profile (no orders list on mobile)
  {
    webPattern: /^\/account\/orders$/,
    toMobilePath: () => "/profile",
  },
  // Account wishlist: /account/wishlist → /wishlist
  {
    webPattern: /^\/account\/wishlist$/,
    toMobilePath: () => "/wishlist",
  },
  // Account profile: /account/profile → /profile
  {
    webPattern: /^\/account\/profile$/,
    toMobilePath: () => "/profile",
  },
  // Search: /search → /search
  {
    webPattern: /^\/search$/,
    toMobilePath: () => "/search",
  },
  // Home: / → /
  {
    webPattern: /^\/$/,
    toMobilePath: () => "/",
  },
];

/**
 * Convert a full web URL to the corresponding mobile app path.
 * Returns `null` for URLs that should not open in the app
 * (auth, checkout, cart, or unknown paths).
 *
 * Query parameters are preserved in the returned path.
 */
export function webUrlToMobilePath(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, "https://www.maisonemile.com");
  } catch {
    return null;
  }

  // Normalise: remove trailing slash except for root
  const pathname =
    parsed.pathname.length > 1 && parsed.pathname.endsWith("/")
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname || "/";

  for (const mapping of ROUTE_MAPPINGS) {
    const matches = pathname.match(mapping.webPattern);
    if (matches) {
      const mobilePath = mapping.toMobilePath(matches);
      const query = parsed.search; // includes leading ?
      return query ? `${mobilePath}${query}` : mobilePath;
    }
  }

  return null;
}

/**
 * Convert a push notification data payload to a mobile app path.
 * Used by the notification tap handler to route users to the
 * correct screen.
 *
 * Returns `null` if the payload doesn't map to a known screen.
 */
export function mobilePushDataToPath(data: Record<string, unknown>): string | null {
  const screen = data.screen as string | undefined;
  if (!screen) return null;

  switch (screen) {
    case "order":
      return data.order_id ? `/order/${data.order_id}/confirmation` : null;
    case "product":
      return data.product_id ? `/products/${data.product_id}` : null;
    case "wishlist":
      return "/wishlist";
    case "search":
      return "/search";
    case "home":
      return "/";
    default:
      return null;
  }
}
