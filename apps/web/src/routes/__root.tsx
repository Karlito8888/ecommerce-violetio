import { useEffect } from "react";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
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
const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Maison Émile — Curated Shopping",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
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
