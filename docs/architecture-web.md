# Architecture — Web App (`apps/web`)

## Executive Summary

The web application is a server-side rendered e-commerce storefront for **Maison Emile**, a curated shopping platform powered by the Violet.io multi-merchant affiliate API. It is built with TanStack Start v1.166+ (Vite-based SSR), React 19.2, and Vanilla CSS with BEM naming. There are 27 file-based routes, suspense-first data loading via TanStack Query v5, and a strict no-Tailwind CSS policy.

---

## Technology Stack

### Runtime Dependencies

| Package                            | Version      | Role                                             |
| ---------------------------------- | ------------ | ------------------------------------------------ |
| `react` / `react-dom`              | ^19.2.4      | UI rendering                                     |
| `@tanstack/react-start`            | ^1.166.2     | SSR framework (Vite plugin + server runtime)     |
| `@tanstack/react-router`           | ^1.166.2     | File-based routing, type-safe navigation         |
| `@tanstack/react-query`            | ^5.90.21     | Server-state cache, suspense queries             |
| `@tanstack/react-router-ssr-query` | ^1.166.2     | SSR dehydration/rehydration bridge               |
| `@tanstack/react-devtools`         | ^0.9.9       | Developer tools panel                            |
| `@tanstack/react-router-devtools`  | ^1.166.2     | Router inspector panel                           |
| `@stripe/react-stripe-js`          | ^5.6.1       | Stripe Elements (payment form)                   |
| `@stripe/stripe-js`                | ^8.9.0       | Stripe.js loader                                 |
| `@supabase/ssr`                    | ^0.9.0       | Cookie-based Supabase client for SSR             |
| `zod`                              | ^4.3.6       | Runtime validation (forms, API responses)        |
| `lucide-react`                     | ^0.577.0     | Icon library (only allowed external icon source) |
| `marked`                           | ^17.0.4      | Markdown-to-HTML parsing (content pages)         |
| `isomorphic-dompurify`             | ^3.4.0       | HTML sanitization (server + client)              |
| `@ecommerce/shared`                | workspace:\* | Business logic, types, Violet/Supabase clients   |
| `@ecommerce/ui`                    | workspace:\* | Design tokens, cross-platform components         |
| `@ecommerce/config`                | workspace:\* | Shared configuration                             |

### Dev Dependencies

| Package                             | Version  | Role                                  |
| ----------------------------------- | -------- | ------------------------------------- |
| `vite`                              | ^7.3.1   | Build tool / dev server               |
| `@vitejs/plugin-react`              | ^5.1.4   | React Fast Refresh                    |
| `@tanstack/devtools-vite`           | ^0.5.3   | Vite devtools integration             |
| `vite-tsconfig-paths`               | ^5.1.4   | `#/*` and `@/*` path alias resolution |
| `@tanstack/router-plugin`           | ^1.166.2 | Route tree auto-generation            |
| `vitest`                            | ^3.0.5   | Test runner                           |
| `jsdom`                             | ^28.1.0  | DOM environment for tests             |
| `@testing-library/react`            | ^16.3.2  | React test utilities                  |
| `@testing-library/dom`              | ^10.4.1  | DOM query utilities                   |
| `typescript`                        | ^5.9.3   | Type checking                         |
| `@supabase/supabase-js`             | ^2.98.0  | Type generation (dev only)            |
| `@types/react` / `@types/react-dom` | ^19.x    | TypeScript definitions                |

---

## Architecture Pattern

### SSR with TanStack Start

TanStack Start runs on Bun with Vite as the underlying build tool. The `tanstackStart()` Vite plugin handles the split between server and client bundles. Server Functions (files under `src/server/`) are automatically tree-shaken from the client bundle — their imports (service keys, adapter credentials) never reach the browser.

The SSR data flow for a page load:

```
1. Client requests /products
2. TanStack Router matches the route, runs loader server-side
3. Loader calls queryClient.ensureInfiniteQueryData(queryOptions)
   → triggers VioletAdapter singleton → Violet API → populates SSR cache
4. setupRouterSsrQueryIntegration dehydrates the cache into the HTML stream
5. Client receives HTML with embedded serialized query cache
6. useSuspenseInfiniteQuery() reads from cache — zero additional fetch
```

### Per-Request QueryClient

A new `QueryClient` is created inside `getRouter()` on every SSR request. This prevents cross-request cache leakage: if request A populates user-specific data, request B starts with an empty cache. The `setupRouterSsrQueryIntegration` call wires the QueryClient into the router and adds the `QueryClientProvider` automatically via `router.options.Wrap`.

Default `staleTime` is 5 minutes, reflecting that catalog data does not change frequently.

### Server Functions Security Boundary

All calls to external APIs (Violet.io, Supabase service role) happen inside TanStack Start Server Functions. These functions:

- Run exclusively in the Node.js server context
- Are stripped from the client bundle at build time
- Hold credentials via environment variables never exposed to the browser
- Return serializable data to the client

The `VioletAdapter` is a **module-scoped singleton** (`src/server/violetAdapter.ts`). A single `VioletTokenManager` authenticates once with Violet on first call, then caches the token for the server process lifetime. This avoids a 100-500ms login round-trip on every request and prevents hitting Violet's login rate limit under load.

---

## Routing

Routes live in `src/routes/` and are auto-discovered by the TanStack Router Vite plugin, which writes `src/routeTree.gen.ts`. This file must not be edited manually.

### Route Tree (27 routes)

```
__root.tsx                         Root layout (HTML shell, providers)
index.tsx                          /  (home)
about.tsx                          /about
auth/
  login.tsx                        /auth/login
  signup.tsx                       /auth/signup
  verify.tsx                       /auth/verify
products/
  index.tsx                        /products
  $productId.tsx                   /products/:productId
search/
  index.tsx                        /search
cart/
  index.tsx                        /cart
checkout/
  index.tsx                        /checkout
order/
  lookup.tsx                       /order/lookup
  $orderId/
    confirmation.tsx               /order/:orderId/confirmation
account/
  route.tsx                        /account (layout — auth guard)
  profile.tsx                      /account/profile
  wishlist.tsx                     /account/wishlist
  orders/
    index.tsx                      /account/orders
    $orderId.tsx                   /account/orders/:orderId
content/
  index.tsx                        /content
  $slug.tsx                        /content/:slug
legal/
  $slug.tsx                        /legal/:slug
help/
  index.tsx                        /help (FAQ)
  contact.tsx                      /help/contact
admin/
  index.tsx                        /admin (dashboard)
  health.tsx                       /admin/health
  support/
    index.tsx                      /admin/support
    $inquiryId.tsx                 /admin/support/:inquiryId
```

### Router Configuration (`src/router.tsx`)

```typescript
const router = createTanStackRouter({
  routeTree,
  context: { queryClient }, // injected into all route loaders
  scrollRestoration: true,
  defaultPreload: "intent", // preloads on hover/focus
  defaultPreloadStaleTime: 0,
});
```

`defaultPreload: "intent"` triggers route data prefetching when the user hovers or focuses a link, providing near-instant navigation feel.

### Auth Guard

The `/account` layout route (`account/route.tsx`) uses TanStack Router's `beforeLoad` hook to protect all child routes. Unauthenticated visitors (including anonymous Supabase sessions) are redirected to `/auth/login?redirect=<original-path>`. No per-route auth check is needed on sub-routes.

---

## Root Layout (`__root.tsx`)

The root route uses `createRootRouteWithContext<RouterContext>()` to give all route loaders access to the `queryClient`.

### Loader

Reads the `violet_cart_id` HttpOnly cookie server-side via `getCartCookieFn`. The result hydrates `CartProvider` immediately on page load, so the cart badge count is correct without a client-side fetch.

### Provider Stack (render order)

```
<html>
  <head>
    <script> THEME_INIT_SCRIPT (flash-free theme) </script>
    <HeadContent />
  </head>
  <body>
    <ToastProvider>
      <CartProvider initialVioletCartId={...} supabase={...} userId={...}>
        <AppBannerContext.Provider>
          <a href="#main-content"> (skip link, sr-only) </a>
          <AppBanner />
          <Header />
          <main id="main-content">{children}</main>
          <Footer />
          <CookieConsentBanner />
        </AppBannerContext.Provider>
        <CartDrawer />
      </CartProvider>
    </ToastProvider>
    <TanStackDevtools />
    <Scripts />
  </body>
</html>
```

### Flash-Free Theme

A hardcoded inline `<script>` runs before CSS loads. It reads `localStorage.theme` (values: `"light"`, `"dark"`, `"auto"`), resolves `"auto"` against `prefers-color-scheme`, then sets `data-theme` and `classList` on `<html>` synchronously. This prevents the white flash on dark-mode preference. The `<html>` tag carries `suppressHydrationWarning` to silence the React mismatch (the attribute is set before hydration).

---

## Component Architecture

Components are organized by domain subfolder under `src/components/`. Feature-level components live in `src/features/`.

### Global (`src/components/`)

| Component     | Purpose                                               |
| ------------- | ----------------------------------------------------- |
| `Header`      | Site navigation, cart badge, theme toggle, auth state |
| `Footer`      | Site links, legal nav                                 |
| `AppBanner`   | Dismissable announcement banner                       |
| `Skeleton`    | Generic loading placeholder                           |
| `ThemeToggle` | Light / dark / auto theme switcher                    |

### Product (`src/components/product/`)

| Component               | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `BaseProductCard`       | Unstyled card primitive (shared logic)               |
| `ProductCard`           | Full product card with image, price, wishlist button |
| `ProductGrid`           | Masonry/grid layout for lists of cards               |
| `ProductGridSkeleton`   | Loading skeleton matching ProductGrid layout         |
| `ProductDetail`         | Full product detail page content                     |
| `ProductDetailSkeleton` | Loading skeleton for product detail                  |
| `ImageGallery`          | Carousel with thumbnail nav, keyboard support        |
| `VariantSelector`       | Color/size variant picker                            |
| `CategoryChips`         | Scrollable chip bar for category filtering           |
| `FilterChips`           | Active filter summary chips with clear actions       |
| `SortSelect`            | Sort order dropdown                                  |
| `PriceBreakdown`        | Price display with discount/sale logic               |
| `WishlistButton`        | Toggle button for wishlist (heart icon)              |
| `RecommendationRow`     | Horizontal scroll row of AI-recommended products     |
| `RecentlyViewedRow`     | Horizontal scroll row of recently viewed products    |

### Search (`src/components/search/`)

| Component           | Purpose                              |
| ------------------- | ------------------------------------ |
| `SearchBar`         | Controlled text input with debounce  |
| `SearchResults`     | Results list with empty/error states |
| `SearchProductCard` | Compact card for search result items |

### Checkout (`src/components/checkout/`)

| Component               | Purpose                                                 |
| ----------------------- | ------------------------------------------------------- |
| `CheckoutErrorBoundary` | React error boundary wrapping checkout form             |
| `CartRecovery`          | Recovers stale cart state after session loss            |
| `BagErrors`             | Per-merchant-bag error display (Violet 200-with-errors) |
| `InventoryAlert`        | Out-of-stock warning for cart items                     |
| `RetryPrompt`           | Retry CTA for transient checkout failures               |

### Content (`src/components/content/`)

| Component             | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `ContentListCard`     | Card for editorial content listings                             |
| `ContentProductCard`  | Inline product mention card within articles                     |
| `MarkdownRenderer`    | Sanitized markdown-to-HTML rendering via `marked` + `dompurify` |
| `AffiliateDisclosure` | FTC-compliant affiliate link disclosure                         |
| `RelatedContent`      | Related articles sidebar/row                                    |
| `ContentTypeFilter`   | Filter bar for content type (guides, reviews, etc.)             |

### Help (`src/components/help/`)

| Component      | Purpose                              |
| -------------- | ------------------------------------ |
| `FaqAccordion` | Accessible accordion for FAQ entries |
| `FaqSearch`    | Client-side FAQ text filter          |
| `ContactForm`  | Support inquiry submission form      |

### Admin (`src/components/admin/`)

| Component            | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `DashboardMetrics`   | KPI cards (orders, revenue, etc.)                |
| `CommissionTable`    | Affiliate commission data table                  |
| `SupportStatusBadge` | Color-coded status indicator for support tickets |
| `TimeRangeSelector`  | Date range picker for dashboard filters          |

### Legal / UI

| Component             | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `CookieConsentBanner` | GDPR cookie consent with accept/reject actions           |
| `Toast`               | Notification toasts (success / error / info) via context |
| `ShareButton`         | Native Web Share API with clipboard fallback             |

### Cart Feature (`src/features/cart/`)

| Component    | Purpose                                               |
| ------------ | ----------------------------------------------------- |
| `CartDrawer` | Slide-over panel, mounted at root, available app-wide |
| `CartBag`    | Grouped items by merchant bag                         |
| `CartItem`   | Single line item with quantity controls               |
| `CartEmpty`  | Empty state with CTA                                  |

### Conventions

Each component file follows this structure:

```typescript
import "./ComponentName.css";              // co-located CSS (product components)
// or global CSS already imported via index.css

export interface ComponentNameProps { ... } // named interface export
const MODULE_CONSTANT = ...;               // module-level constants
export default function ComponentName(props: ComponentNameProps) { ... }
// internal helpers below the default export
```

---

## State Management

There is no global state library. State is distributed across three mechanisms:

| Scope              | Mechanism                     | Examples                                     |
| ------------------ | ----------------------------- | -------------------------------------------- |
| Server/async state | TanStack Query cache          | Product listings, cart data, orders, content |
| Cart UI state      | `CartContext` (React context) | Cart ID, open/close drawer, item count       |
| Auth state         | `useAuthSession` hook         | Current user, anonymous flag, loading        |
| Ephemeral UI state | `useState`                    | Modals, form values, accordion open          |

### `CartContext` (`src/contexts/CartContext.tsx`)

Holds the current `violet_cart_id` and whether the cart drawer is open. Initialized from the HttpOnly cookie value passed via the root loader. The Supabase Realtime subscription for cart sync is established inside CartProvider when a non-anonymous `userId` is present.

### `useAuthSession` (`src/hooks/useAuthSession.ts`)

Subscribes to `supabase.auth.onAuthStateChange`. On `INITIAL_SESSION` with no session, it calls `initAnonymousSession()` to create an anonymous Supabase user. This ensures every visitor has a session (required for wishlist, recently-viewed, and cart ownership tracking). The hook defers setting `isLoading: false` until the anonymous sign-in resolves, preventing a flash of unauthenticated UI.

```typescript
const { user, session, isLoading, isAnonymous } = useAuthSession();
```

---

## CSS Architecture

Styles live in `src/styles/`. The single entry point is `index.css`, imported as a Vite URL asset in `__root.tsx`:

```typescript
import appCss from "../styles/index.css?url";
// injected as <link rel="stylesheet" href={appCss}>
```

### Layer Order

```
tokens.css          Design tokens (custom properties)
base.css            Reset, body, selection styles
utilities.css       .sr-only, .page-wrap, animations
components/*.css    28 BEM block files
pages/*.css         18 page-specific BEM blocks
```

Import order is load-order in CSS — tokens must precede components, components must precede pages. Changing the order in `index.css` breaks the cascade.

### Design Tokens (`tokens.css`)

All visual values are CSS custom properties. Key categories:

| Category             | Example tokens                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Warm neutral palette | `--color-ivory`, `--color-linen`, `--color-sand`, `--color-stone`, `--color-taupe`, `--color-sienna` |
| Gold accent          | `--color-gold`, `--color-amber`, `--color-midnight`                                                  |
| Semantic text        | `--color-text`, `--color-text-secondary`, `--color-text-muted`                                       |
| Semantic feedback    | `--color-success`, `--color-warning`, `--color-error`, `--color-info`                                |
| Typography           | `--font-display` (Cormorant Garamond), `--font-body` (Inter)                                         |
| Type scale           | `--text-xs` (12px) through `--text-4xl` (36px)                                                       |
| Spacing (4px base)   | `--space-1` (4px) through `--space-16` (64px)                                                        |
| Shadows              | `--shadow-sm`, `--shadow-md`, `--shadow-lg` (warm-tinted)                                            |
| Border radius        | `--radius-sm` (4px) through `--radius-full` (9999px)                                                 |
| Z-index scale        | `--z-base` (0) through `--z-toast` (600), `--z-cookie-banner` (900)                                  |
| Surfaces             | `--surface-frosted`, `--surface-elevated`, `--surface-glass`                                         |
| Transitions          | `--transition-fast` (120ms), `--transition-normal` (200ms), `--transition-slow` (300ms)              |

### Dark Theme

Dark mode is applied via `[data-theme="dark"]` on `<html>`. The attribute is set by the inline THEME_INIT_SCRIPT before the stylesheet loads (no FOUC). The dark theme overrides the warm neutral palette (ivory/midnight swap for bg/text) while preserving gold/amber accents. Gold on midnight background achieves 7.2:1 contrast ratio (WCAG AAA).

There is no `@media (prefers-color-scheme: dark)` duplication — the JS layer always resolves and sets `data-theme`, making a single CSS selector sufficient.

### BEM Naming Convention

```css
.block {
}
.block__element {
}
.block--modifier {
}
.block__element--modifier {
}

/* Examples */
.site-header {
}
.site-header__nav {
}
.site-header__nav--open {
}
.product-card__price--sale {
}
```

---

## Server Functions

All files under `src/server/` contain TanStack Start Server Functions created with `createServerFn()`. They are the exclusive point of contact with external services.

### Supabase Clients

Two distinct clients serve different purposes:

| Client                       | Function                       | Key                              | RLS      |
| ---------------------------- | ------------------------------ | -------------------------------- | -------- |
| `getSupabaseServer()`        | `src/server/supabaseServer.ts` | Service role (env)               | Bypassed |
| `getSupabaseSessionClient()` | `src/server/supabaseServer.ts` | Anon key + user JWT from cookies | Enforced |

`getSupabaseServer()` is a module-scoped singleton (service role, no session persistence). Used for cart persistence and admin operations.

`getSupabaseSessionClient()` reads the user's session JWT from cookies via `@supabase/ssr` and respects RLS policies. Used for user-facing data (orders, profile, wishlist).

### Server Function Modules

| Module                                     | Responsibilities                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `cartActions.ts`                           | Create/get/update/remove cart items; sets `violet_cart_id` HttpOnly cookie      |
| `getProducts.ts`                           | Paginated product listings, category list from Violet API                       |
| `getProduct.ts`                            | Single product detail from Violet API                                           |
| `checkout.ts`                              | Checkout session creation, shipping, payment intent                             |
| `orders.ts` / `orderHandlers.ts`           | Authenticated user order history and detail                                     |
| `guestOrders.ts` / `guestOrderHandlers.ts` | Guest order lookup by email + order ID                                          |
| `tracking.ts` / `trackingHandlers.ts`      | Recently-viewed product history writes                                          |
| `authInit.ts`                              | Anonymous session initialization                                                |
| `violetAuth.ts`                            | Violet.io token acquisition and refresh                                         |
| `violetAdapter.ts`                         | Singleton VioletAdapter (see below)                                             |
| `supabaseServer.ts`                        | Supabase server client factory                                                  |
| `adminAuth.ts`                             | Admin user verification via `app_metadata.user_role`                            |
| `adminAuthGuard.ts`                        | `requireAdminOrThrow` helper (separate module to prevent client bundle leakage) |
| `getAdminDashboard.ts` / `Handler.ts`      | Commission and sales metrics                                                    |
| `getAdminHealth.ts` / `Handler.ts`         | Platform health checks                                                          |
| `getAdminSupport.ts` / `Handler.ts`        | Support inquiry listing                                                         |
| `submitSupport.ts` / `Handler.ts`          | New support inquiry creation                                                    |
| `updateSupportInquiry.ts` / `Handler.ts`   | Support ticket status updates                                                   |
| `replySupportInquiry.ts` / `Handler.ts`    | Admin replies to support tickets                                                |
| `getContent.ts`                            | Editorial content and article fetching from Supabase                            |
| `getFaq.ts`                                | FAQ entries from Supabase                                                       |
| `getLegalContent.ts`                       | Legal page content from Supabase                                                |
| `cartSync.ts`                              | Supabase Realtime cart synchronization                                          |

### Cart Flow (3-step pattern)

Every cart mutation in `cartActions.ts` follows this sequence:

```
1. VioletAdapter → Violet API  (create or modify the Violet cart)
2. Supabase upsert             (persist violet_cart_id linked to user/session)
3. Return merged Cart          (Violet data + Supabase UUID) to client
```

Violet returns HTTP 200 even when items have errors (e.g., out of stock). The adapter extracts `errors` from each bag. The client UI displays per-bag errors inline — not as global toasts.

---

## Testing

### Configuration

Vitest is configured inline in `vite.config.ts`:

```typescript
test: {
  environment: "jsdom",
  globals: true,
  setupFiles: ["./src/__tests__/setup.ts"],
}
```

The setup file sets `IS_REACT_ACT_ENVIRONMENT = true` globally to suppress the `act()` warning in jsdom.

To prevent React dual-instance issues when running tests, `vite.config.ts` applies absolute path aliases for `react` and `react-dom` in test mode only:

```typescript
const isTest = !!process.env.VITEST;
// isTest → alias react/react-dom to apps/web/node_modules/react
```

### Test File Layout

- **31 files** in `src/__tests__/` — unit and integration tests for server functions, hooks, and utilities
- **9 files** co-located in `src/components/*/__tests__/` — component-level tests

```
src/__tests__/
  setup.ts
  supabaseClient.test.ts
  authFunctions.test.ts
  rlsPolicy.test.ts
  rlsPolicy.integration.test.ts
  violetAuth.test.ts
  profileSchemas.test.ts
  useTracking.test.ts
  personalization.test.ts
  wishlist.test.ts
  recommendations.test.ts
  recently-viewed.test.ts
  notification-preferences.test.ts
  deep-link.test.ts
  content.test.ts
  content-list.test.ts
  contentAdmin.test.ts
  faq.test.ts
  seo-advanced.test.ts
  generate-sitemap.test.ts
  useShare.test.ts
  ShareButton.test.ts
  support.test.ts
  submitSupportHandler.test.ts
  admin.test.ts
  admin-health.test.ts
  admin-support.test.ts
  legal-pages.test.ts

src/components/product/__tests__/
  ImageGallery.test.tsx
  PriceBreakdown.test.tsx
  ProductCard.test.tsx
  ProductDetail.test.tsx
  VariantSelector.test.tsx
  FilterChips.test.tsx
  SortSelect.test.tsx

src/components/search/__tests__/
  SearchBar.test.tsx
  SearchResults.test.tsx

src/server/__tests__/
  orders.test.ts
  guestOrders.test.ts
```

### Rendering Pattern

Tests use `createRoot` + `act()` directly for component rendering. No `@testing-library/react` rendering utilities (`render`) are used — the package is present for its DOM query helpers (`screen`, `fireEvent`, `waitFor`).

Mock factories follow the pattern `createMockXxx(overrides?)`:

```typescript
const product = createMockProduct({ price: 4999 });
const cart = createMockCart({ items: [createMockCartItem()] });
```

### Running Tests

```bash
bun --cwd=apps/web run test
# or from repo root:
bun run test   # if workspace scripts delegate to web
```

---

## Build Configuration (`vite.config.ts`)

```typescript
defineConfig({
  plugins: [
    devtools(),           // TanStack devtools panel (dev only)
    tsconfigPaths({ projects: ["./tsconfig.json"] }),  // #/* alias
    tanstackStart(),      // SSR split, server function extraction
    viteReact(),          // React Fast Refresh
  ],
  resolve: {
    dedupe: ["react", "react-dom"],   // prevent dual-instance in monorepo
    // test mode only: absolute alias to apps/web/node_modules/react
  },
  test: { environment: "jsdom", globals: true, setupFiles: [...] },
})
```

### Path Aliases

Defined in `apps/web/package.json` (`"imports"`) and `tsconfig.json`:

| Alias | Resolves to                                                         |
| ----- | ------------------------------------------------------------------- |
| `#/*` | `./src/*` (Node.js subpath imports — available in server functions) |
| `@/*` | `./src/*` (tsconfig paths — available in all files)                 |

### Environment Variables

| Variable                      | Used in         | Purpose                             |
| ----------------------------- | --------------- | ----------------------------------- |
| `VITE_SUPABASE_URL`           | Client + server | Supabase project URL                |
| `VITE_SUPABASE_ANON_KEY`      | Client          | Supabase anonymous key              |
| `SUPABASE_URL`                | Server only     | Supabase URL (server-side fallback) |
| `SUPABASE_SERVICE_ROLE_KEY`   | Server only     | Service role key (bypasses RLS)     |
| `VITE_VIOLET_API_KEY`         | Server only     | Violet.io API credentials           |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Client          | Stripe publishable key for Elements |

`VITE_` prefixed variables are bundled into the client. Service keys must use non-`VITE_` names to stay server-only. `SUPABASE_SERVICE_ROLE_KEY` has no `VITE_` prefix intentionally.

---

## Key Design Decisions

**No Tailwind CSS.** The project uses Vanilla CSS + BEM exclusively. This is an architectural constraint, not a configuration choice. Do not add Tailwind.

**Singleton VioletAdapter.** Module-scoped in `src/server/violetAdapter.ts`. One token manager, one login per server lifetime. Adding multiple instances causes redundant Violet API logins and may trigger rate limiting.

**Per-request QueryClient.** Created inside `getRouter()`, not at module scope. This is required for SSR correctness — module-scoped QueryClient would share cache across different users' requests.

**`adminAuthGuard.ts` is a separate module.** The `requireAdminOrThrow` function is isolated from `adminAuth.ts` to prevent the import chain from reaching the client bundle. TanStack Start's server function extraction relies on static analysis — splitting the guard prevents client-bundle import errors.

**Anonymous sessions are always created.** Every visitor gets a Supabase anonymous session. This is required for the cart ownership model (`CONSTRAINT carts_has_owner` demands either `user_id` or `session_id`), wishlist, and browsing history. The upgrade path from anonymous to identified user is handled by Supabase's `linkIdentity`.

**Violet 200-with-errors.** Violet returns HTTP 200 when cart operations partially succeed (e.g., one item out of stock). The adapter extracts `bags[n].errors` and the UI must handle per-bag error display. A successful HTTP status does not mean all items were processed.
