import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { QueryClient } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { routeTree } from "./routeTree.gen";

/**
 * Router context type — shared with all route loaders via `createRootRouteWithContext`.
 *
 * ## Why queryClient lives in router context
 *
 * Route loaders need `queryClient` to call `ensureQueryData()` /
 * `ensureInfiniteQueryData()` for SSR prefetching. Without context, loaders
 * can only return raw data (bypassing TanStack Query cache entirely).
 *
 * With context, the SSR flow becomes:
 * 1. Loader calls `queryClient.ensureInfiniteQueryData(productsInfiniteQueryOptions(...))`
 * 2. Data lands in the query cache (server-side)
 * 3. `setupRouterSsrQueryIntegration` dehydrates the cache into the HTML stream
 * 4. Client-side, `useSuspenseInfiniteQuery(...)` finds data already in cache
 * 5. No redundant client-side re-fetch on initial load
 *
 * @see https://tanstack.com/router/latest/docs/framework/react/guide/data-loading
 */
export interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Creates the application router with TanStack Query SSR + Convex Auth support.
 *
 * Convex data uses `convex/react` hooks directly (useQuery, useMutation).
 * Violet API data uses TanStack Query hooks. These two systems are independent —
 * no bridge needed. The `@convex-dev/react-query` package was previously wired
 * here but was unused (no hook called `convexQuery()`), so it was removed.
 *
 * The QueryClient is created **per-request** (inside getRouter) to prevent
 * cross-request data leakage in SSR. Each SSR request gets its own isolated cache.
 *
 * @see https://tanstack.com/router/latest/docs/framework/react/guide/data-loading
 * @see https://labs.convex.dev/auth/setup
 */
export function getRouter() {
  const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
  if (!CONVEX_URL) {
    throw new Error("Missing VITE_CONVEX_URL environment variable");
  }

  const convexClient = new ConvexReactClient(CONVEX_URL, {
    unsavedChangesWarning: false,
    // Self-hosted: URL is not *.convex.cloud, skip the deployment check.
    skipConvexDeploymentUrlCheck: true,
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        /** 5 minutes — catalog data doesn't change frequently */
        staleTime: 5 * 60 * 1000,
      },
    },
  });

  const router = createTanStackRouter({
    routeTree,
    /**
     * Inject queryClient into router context so all route loaders can access it
     * via `context.queryClient`. This is the TanStack-recommended pattern for
     * SSR data loading with TanStack Query.
     */
    context: { queryClient },

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,

    // ConvexAuthProvider wraps the app INSIDE the SSR QueryClientProvider.
    // This ensures auth state is available to all routes and queries.
    Wrap: ({ children }: { children: React.ReactNode }) => (
      <ConvexAuthProvider client={convexClient}>{children}</ConvexAuthProvider>
    ),

    defaultNotFoundComponent: () => (
      <div className="page-wrap" style={{ padding: "4rem 0", textAlign: "center" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "1rem" }}>404 — Page Not Found</h1>
        <p style={{ color: "var(--color-text-secondary)" }}>
          The page you are looking for does not exist.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            marginTop: "1.5rem",
            padding: "0.75rem 1.5rem",
            background: "var(--color-primary)",
            color: "#fff",
            borderRadius: "0.5rem",
            textDecoration: "none",
          }}
        >
          Go Home
        </a>
      </div>
    ),
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
