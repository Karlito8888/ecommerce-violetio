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

import appCss from "../styles/index.css?url";

// Static theme init script — hardcoded string, no user input, safe from XSS.
const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);root.setAttribute('data-theme',resolved);root.style.colorScheme=resolved;}catch(e){}})();`;

/**
 * Root route with typed router context.
 *
 * `createRootRouteWithContext<RouterContext>()` makes `queryClient` available
 * in all child route loaders via `context.queryClient`. This is required for
 * SSR data prefetching with TanStack Query (ensureQueryData / ensureInfiniteQueryData).
 *
 * The context value is provided by `getRouter()` in `router.tsx` via
 * `createTanStackRouter({ context: { queryClient } })`.
 */
/**
 * Root route — HTML shell with global defaults.
 *
 * ## SEO Meta Strategy (Story 3.8)
 *
 * TanStack Start **merges** child `head()` meta with root meta (child `title`
 * overrides, other tags accumulate). To avoid duplicate OG/Twitter tags:
 *
 * - Root sets **site-wide invariants only**: charset, viewport, og:site_name,
 *   og:locale. These never change per-page.
 * - Root does NOT set og:type or twitter:card — those come from each child
 *   route via `buildPageMeta()`, which generates the full tag set per page.
 * - Default title and description act as fallbacks for routes that don't
 *   override them (e.g., 404 or future routes without explicit head()).
 */
export const Route = createRootRouteWithContext<RouterContext>()({
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
      // Site-wide OG invariants (child routes add og:title, og:type, etc. via buildPageMeta)
      { property: "og:site_name", content: "Maison Émile" },
      { property: "og:locale", content: "en_US" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const appBanner = useAppBannerProvider();

  useEffect(() => {
    initAnonymousSession(getSupabaseBrowserClient()).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[auth] initAnonymousSession error:", err);
    });
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <AppBannerContext.Provider value={appBanner}>
          <a href="#main-content" className="sr-only sr-only--focusable">
            Skip to content
          </a>
          <AppBanner />
          <Header />
          <main id="main-content">{children}</main>
          <Footer />
        </AppBannerContext.Provider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
