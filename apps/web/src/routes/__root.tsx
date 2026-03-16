import { useEffect } from "react";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { RouterContext } from "../router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import AppBanner from "../components/AppBanner";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { AppBannerContext, useAppBannerProvider } from "../hooks/useAppBanner";
import { initAnonymousSession } from "@ecommerce/shared";
import { getSupabaseBrowserClient } from "../utils/supabase";
import { CartProvider } from "../contexts/CartContext";
import { useAuthSession } from "../hooks/useAuthSession";
import { useTrackingListener } from "../hooks/useTrackingListener";
import CartDrawer from "../features/cart/CartDrawer";
import {
  getCartFn,
  getCartCookieFn,
  updateCartItemFn,
  removeFromCartFn,
} from "../server/cartActions";
import type { CartFetchFn, UpdateCartItemFn, RemoveFromCartFn } from "@ecommerce/shared";

import appCss from "../styles/index.css?url";

// Static theme init script — hardcoded string, no user input, safe from XSS.
const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);root.setAttribute('data-theme',resolved);root.style.colorScheme=resolved;}catch(e){}})();`;

/**
 * Platform-specific adapters for CartDrawer shared hooks.
 * TanStack Start Server Functions use .({ data: ... }) convention;
 * shared hook types expect plain function signatures.
 */
const fetchCart: CartFetchFn = (violetCartId) => getCartFn({ data: violetCartId });
const updateCartItem: UpdateCartItemFn = (input) => updateCartItemFn({ data: input });
const removeFromCart: RemoveFromCartFn = (input) => removeFromCartFn({ data: input });

/**
 * Root route — HTML shell with global defaults.
 *
 * ## Cart Integration (Story 4.1)
 * CartProvider wraps the entire app so the cart drawer is available on every
 * page. CartDrawer is mounted inside CartProvider to access useCartContext().
 *
 * The loader reads the `violet_cart_id` HttpOnly cookie server-side on every
 * initial page load/refresh, so CartProvider is hydrated with the existing cart
 * ID without requiring a client-side round-trip.
 *
 * ## SEO Meta Strategy (Story 3.8)
 * Root sets site-wide invariants only; child routes add page-specific meta.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  loader: async () => {
    const { violetCartId } = await getCartCookieFn();
    return { initialVioletCartId: violetCartId ?? null };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Maison Émile — Curated Shopping" },
      {
        name: "description",
        content:
          "Discover unique products from curated merchants — powered by AI search. Maison Émile brings you a handpicked shopping experience.",
      },
      { property: "og:site_name", content: "Maison Émile" },
      { property: "og:locale", content: "en_US" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const appBanner = useAppBannerProvider();
  // Hydrate CartProvider from the HttpOnly cookie read server-side in the loader.
  // This ensures the cart badge and drawer are populated immediately on page refresh,
  // without waiting for a client-side fetch.
  const { initialVioletCartId } = Route.useLoaderData();

  // Auth session for Realtime subscription (Story 4.6)
  const { user, isAnonymous } = useAuthSession();
  const supabase = getSupabaseBrowserClient();
  // Only provide userId for non-anonymous authenticated users — anonymous users don't sync
  const syncUserId = user && !isAnonymous ? user.id : null;

  // Browsing history tracking (Story 6.2) — only for authenticated users
  useTrackingListener(syncUserId ?? undefined);

  useEffect(() => {
    initAnonymousSession(supabase).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[auth] initAnonymousSession error:", err);
    });
  }, [supabase]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <CartProvider
          initialVioletCartId={initialVioletCartId}
          supabase={supabase}
          userId={syncUserId}
        >
          <AppBannerContext.Provider value={appBanner}>
            <a href="#main-content" className="sr-only sr-only--focusable">
              Skip to content
            </a>
            <AppBanner />
            <Header />
            <main id="main-content">{children}</main>
            <Footer />
          </AppBannerContext.Provider>
          {/* CartDrawer mounted inside CartProvider — always available app-wide */}
          <CartDrawer
            fetchCartFn={fetchCart}
            updateCartItemFn={updateCartItem}
            removeFromCartFn={removeFromCart}
          />
        </CartProvider>
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> }]}
        />
        <Scripts />
      </body>
    </html>
  );
}
