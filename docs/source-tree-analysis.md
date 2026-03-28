# Source Tree Analysis

Annotated directory structure for the E-commerce monorepo.
Last updated: 2026-03-28. Package manager: Bun 1.2.4 workspaces.

---

```
e-commerce/                                    # Monorepo root — Bun 1.2.4 workspaces
│                                              # Root scripts: dev, build, lint, typecheck,
│                                              # format, test, fix-all, generate:sitemap
├── apps/
│   │
│   ├── web/                                   # TanStack Start v1 SSR web app (port 3000)
│   │   │                                      # Vite-based, file-based routing, React 19
│   │   ├── src/
│   │   │   │
│   │   │   ├── routes/                        # File-based route tree (27 route files)
│   │   │   │   │                              # Auto-generates routeTree.gen.ts via TanStack Router
│   │   │   │   ├── __root.tsx                 # HTML shell: providers, theme init script, Header/Footer
│   │   │   │   ├── index.tsx                  # Homepage (/)
│   │   │   │   ├── about.tsx                  # About page (/about)
│   │   │   │   │
│   │   │   │   ├── auth/
│   │   │   │   │   ├── login.tsx              # Login form (/auth/login)
│   │   │   │   │   ├── signup.tsx             # Registration form (/auth/signup)
│   │   │   │   │   └── verify.tsx             # Email verification (/auth/verify)
│   │   │   │   │
│   │   │   │   ├── products/
│   │   │   │   │   ├── index.tsx              # Product listing with filters (/products)
│   │   │   │   │   └── $productId.tsx         # Product detail page (/products/:productId)
│   │   │   │   │
│   │   │   │   ├── search/
│   │   │   │   │   └── index.tsx              # AI-powered semantic search (/search)
│   │   │   │   │
│   │   │   │   ├── cart/
│   │   │   │   │   └── index.tsx              # Shopping cart page (/cart)
│   │   │   │   │
│   │   │   │   ├── checkout/
│   │   │   │   │   └── index.tsx              # Stripe checkout flow (/checkout)
│   │   │   │   │
│   │   │   │   ├── order/
│   │   │   │   │   ├── lookup.tsx             # Guest order lookup by email/OTP (/order/lookup)
│   │   │   │   │   └── $orderId/
│   │   │   │   │       └── confirmation.tsx   # Post-purchase confirmation (/order/:orderId/confirmation)
│   │   │   │   │
│   │   │   │   ├── account/                   # Auth-guarded section
│   │   │   │   │   ├── route.tsx              # Auth guard layout — redirects unauthenticated users
│   │   │   │   │   ├── profile.tsx            # User profile management (/account/profile)
│   │   │   │   │   ├── wishlist.tsx           # Saved products (/account/wishlist)
│   │   │   │   │   └── orders/
│   │   │   │   │       ├── index.tsx          # Order history list (/account/orders)
│   │   │   │   │       └── $orderId.tsx       # Order detail view (/account/orders/:orderId)
│   │   │   │   │
│   │   │   │   ├── content/
│   │   │   │   │   ├── index.tsx              # Editorial content listing (/content)
│   │   │   │   │   └── $slug.tsx              # Content detail page (/content/:slug)
│   │   │   │   │
│   │   │   │   ├── legal/
│   │   │   │   │   └── $slug.tsx              # Dynamic legal pages: privacy, terms (/legal/:slug)
│   │   │   │   │
│   │   │   │   ├── help/
│   │   │   │   │   ├── index.tsx              # FAQ page (/help)
│   │   │   │   │   └── contact.tsx            # Contact / support form (/help/contact)
│   │   │   │   │
│   │   │   │   └── admin/                     # Admin-only section (role-checked server-side)
│   │   │   │       ├── index.tsx              # Analytics & commission dashboard (/admin)
│   │   │   │       ├── health.tsx             # Platform health monitoring (/admin/health)
│   │   │   │       └── support/
│   │   │   │           ├── index.tsx          # Support inquiry list (/admin/support)
│   │   │   │           └── $inquiryId.tsx     # Inquiry detail + reply (/admin/support/:inquiryId)
│   │   │   │
│   │   │   ├── components/                    # Reusable React components, grouped by domain
│   │   │   │   │
│   │   │   │   ├── product/                   # Product display components (19 files)
│   │   │   │   │   ├── BaseProductCard.tsx    # Shared card base used by ProductCard + SearchProductCard
│   │   │   │   │   ├── ProductCard.tsx        # Standard product tile with wishlist action
│   │   │   │   │   ├── ProductGrid.tsx        # Responsive product grid layout
│   │   │   │   │   ├── ProductGridSkeleton.tsx # Loading skeleton for product grids
│   │   │   │   │   ├── ProductDetail.tsx      # Full product detail view (images, variants, CTA)
│   │   │   │   │   ├── ProductDetailSkeleton.tsx # Loading skeleton for detail page
│   │   │   │   │   ├── ImageGallery.tsx       # Product image carousel / gallery
│   │   │   │   │   ├── VariantSelector.tsx    # SKU variant picker (size, color, etc.)
│   │   │   │   │   ├── PriceBreakdown.tsx     # Transparent pricing breakdown (base + markup)
│   │   │   │   │   ├── CategoryChips.tsx      # Horizontal category filter chips
│   │   │   │   │   ├── FilterChips.tsx        # Active filter badges with remove action
│   │   │   │   │   ├── SortSelect.tsx         # Sort-by dropdown selector
│   │   │   │   │   ├── WishlistButton.tsx     # Wishlist toggle button (heart icon)
│   │   │   │   │   ├── RecommendationRow.tsx  # AI-powered "you may also like" row
│   │   │   │   │   └── RecentlyViewedRow.tsx  # Recently viewed products horizontal row
│   │   │   │   │
│   │   │   │   ├── search/                    # Search UI components (3 files)
│   │   │   │   │   ├── SearchBar.tsx          # Search input with debounce
│   │   │   │   │   ├── SearchResults.tsx      # Results list container
│   │   │   │   │   └── SearchProductCard.tsx  # Compact product card for search results
│   │   │   │   │
│   │   │   │   ├── checkout/                  # Checkout-specific UI (5 files)
│   │   │   │   │   ├── BagErrors.tsx          # Per-bag error display (stock, merchant issues)
│   │   │   │   │   ├── CartRecovery.tsx       # Stale cart recovery prompt
│   │   │   │   │   ├── CheckoutErrorBoundary.tsx # React error boundary for checkout flow
│   │   │   │   │   ├── InventoryAlert.tsx     # Out-of-stock / low-stock inline alert
│   │   │   │   │   └── RetryPrompt.tsx        # Payment retry UI after failure
│   │   │   │   │
│   │   │   │   ├── content/                   # Editorial content components (6 files)
│   │   │   │   │   ├── ContentListCard.tsx    # Content article preview card
│   │   │   │   │   ├── ContentProductCard.tsx # Product card embedded in articles
│   │   │   │   │   ├── ContentTypeFilter.tsx  # Filter by content type (guide, review, etc.)
│   │   │   │   │   ├── MarkdownRenderer.tsx   # Safe Markdown-to-HTML renderer
│   │   │   │   │   ├── AffiliateDisclosure.tsx # FTC-compliant affiliate disclosure banner
│   │   │   │   │   └── RelatedContent.tsx     # Related articles sidebar/section
│   │   │   │   │
│   │   │   │   ├── help/                      # Help center components (3 files)
│   │   │   │   │   ├── ContactForm.tsx        # Support inquiry submission form
│   │   │   │   │   ├── FaqAccordion.tsx       # Expandable FAQ question/answer component
│   │   │   │   │   └── FaqSearch.tsx          # Client-side FAQ text search
│   │   │   │   │
│   │   │   │   ├── admin/                     # Admin dashboard components (4 files)
│   │   │   │   │   ├── CommissionTable.tsx    # Violet.io commission breakdown table
│   │   │   │   │   ├── DashboardMetrics.tsx   # KPI cards (orders, revenue, conversions)
│   │   │   │   │   ├── SupportStatusBadge.tsx # Colored badge for inquiry status
│   │   │   │   │   └── TimeRangeSelector.tsx  # Date range picker for dashboard filters
│   │   │   │   │
│   │   │   │   ├── legal/                     # Legal / compliance components (1 file)
│   │   │   │   │   └── CookieConsentBanner.tsx # GDPR cookie consent banner
│   │   │   │   │
│   │   │   │   ├── ui/                        # Generic UI primitives (2 files)
│   │   │   │   │   ├── Toast.tsx              # Toast notification component
│   │   │   │   │   └── ShareButton.tsx        # Native share / clipboard copy button
│   │   │   │   │
│   │   │   │   ├── Header.tsx                 # Site header: logo, nav, cart icon, theme toggle
│   │   │   │   ├── Footer.tsx                 # Site footer: links, legal, social
│   │   │   │   ├── AppBanner.tsx              # Mobile app download promotional banner
│   │   │   │   ├── Skeleton.tsx               # Generic skeleton loading placeholder
│   │   │   │   └── ThemeToggle.tsx            # Light/dark mode toggle button
│   │   │   │
│   │   │   ├── features/
│   │   │   │   └── cart/                      # Cart drawer feature (4 files)
│   │   │   │       ├── CartDrawer.tsx         # Slide-in cart panel (overlays all pages)
│   │   │   │       ├── CartBag.tsx            # Per-merchant bag grouping inside drawer
│   │   │   │       ├── CartItem.tsx           # Individual line item with qty controls
│   │   │   │       └── CartEmpty.tsx          # Empty cart state illustration + CTA
│   │   │   │
│   │   │   ├── contexts/
│   │   │   │   └── CartContext.tsx            # Global cart state provider (open/close drawer,
│   │   │   │                                  # cart data, optimistic updates)
│   │   │   │
│   │   │   ├── hooks/                         # Web-specific React hooks (5 files)
│   │   │   │   ├── useAuthSession.ts          # Supabase session watcher + auto-refresh
│   │   │   │   ├── useUser.ts                 # Current user convenience hook
│   │   │   │   ├── useAppBanner.ts            # Controls mobile app banner display logic
│   │   │   │   ├── useTrackingListener.ts     # Fires tracking events on route changes
│   │   │   │   └── useCookieConsent.ts        # Cookie consent state + localStorage persistence
│   │   │   │
│   │   │   ├── server/                        # TanStack Start server functions (35 files)
│   │   │   │   │                              # All files run server-side only (never bundled to client)
│   │   │   │   ├── authInit.ts                # Violet token initialization on session start
│   │   │   │   ├── violetAuth.ts              # Violet.io auth token management
│   │   │   │   ├── violetAdapter.ts           # Violet API adapter (wraps shared adapter for SSR)
│   │   │   │   ├── supabaseServer.ts          # Server-side Supabase client factory
│   │   │   │   ├── adminAuth.ts               # Admin role verification helpers
│   │   │   │   ├── adminAuthGuard.ts          # Server function guard — throws if not admin
│   │   │   │   ├── getProduct.ts              # Fetch single product from Violet API
│   │   │   │   ├── getProducts.ts             # Fetch product list with filters/pagination
│   │   │   │   ├── getContent.ts              # Fetch editorial content from Supabase
│   │   │   │   ├── getLegalContent.ts         # Fetch legal page content by slug
│   │   │   │   ├── getFaq.ts                  # Fetch FAQ entries from Supabase
│   │   │   │   ├── cartSync.ts                # Server-side cart sync with Violet
│   │   │   │   ├── cartActions.ts             # Add/remove/update cart item server functions
│   │   │   │   ├── checkout.ts                # Checkout initiation + Stripe payment intent
│   │   │   │   ├── orders.ts                  # Authenticated order queries
│   │   │   │   ├── orderHandlers.ts           # TanStack Start handler wrappers for orders
│   │   │   │   ├── guestOrders.ts             # Guest order lookup (token or OTP)
│   │   │   │   ├── guestOrderHandlers.ts      # Handler wrappers for guest order routes
│   │   │   │   ├── tracking.ts                # Server-side event tracking calls
│   │   │   │   ├── trackingHandlers.ts        # Handler wrappers for tracking endpoints
│   │   │   │   ├── submitSupport.ts           # Support inquiry creation logic
│   │   │   │   ├── submitSupportHandler.ts    # Handler wrapper for support form submission
│   │   │   │   ├── getAdminDashboard.ts       # Admin metrics queries
│   │   │   │   ├── getAdminDashboardHandler.ts # Handler wrapper for dashboard data
│   │   │   │   ├── getAdminHealth.ts          # Health monitoring data queries
│   │   │   │   ├── getAdminHealthHandler.ts   # Handler wrapper for health endpoint
│   │   │   │   ├── getAdminSupport.ts         # Admin support inquiry list queries
│   │   │   │   ├── getAdminSupportHandler.ts  # Handler wrapper for support admin
│   │   │   │   ├── replySupportInquiry.ts     # Admin reply to support inquiry
│   │   │   │   ├── replySupportInquiryHandler.ts
│   │   │   │   ├── updateSupportInquiry.ts    # Update inquiry status (open/closed/pending)
│   │   │   │   └── updateSupportInquiryHandler.ts
│   │   │   │
│   │   │   ├── utils/                         # Web-specific utilities (3 files)
│   │   │   │   ├── authErrors.ts              # Auth error message mapping
│   │   │   │   ├── supabase.ts                # Browser Supabase client singleton
│   │   │   │   └── faqFilter.ts               # Client-side FAQ text filtering logic
│   │   │   │
│   │   │   ├── styles/                        # Vanilla CSS (BEM). Strict import order enforced.
│   │   │   │   ├── index.css                  # Entry point — imports in order: tokens, base,
│   │   │   │   │                              # utilities, components, pages
│   │   │   │   ├── tokens.css                 # CSS custom properties: colors, spacing, typography,
│   │   │   │   │                              # radii, shadows. Includes dark theme overrides.
│   │   │   │   ├── base.css                   # CSS reset, body styles, decorative pseudo-elements
│   │   │   │   ├── utilities.css              # .sr-only, .page-wrap, .display-title, animations
│   │   │   │   │
│   │   │   │   ├── components/                # 28 component-level BEM blocks
│   │   │   │   │   ├── header.css             # .site-header, .site-header__nav
│   │   │   │   │   ├── footer.css             # .site-footer
│   │   │   │   │   ├── product-card.css       # .product-card, .product-card__image, etc.
│   │   │   │   │   ├── product-grid.css       # .product-grid responsive grid
│   │   │   │   │   ├── category-chips.css     # .category-chips horizontal scroll
│   │   │   │   │   ├── chip.css               # .chip base + modifier styles
│   │   │   │   │   ├── chip-bar.css           # .chip-bar wrapper for chip collections
│   │   │   │   │   ├── search-bar.css         # .search-bar input styling
│   │   │   │   │   ├── search-results.css     # .search-results list
│   │   │   │   │   ├── cart-drawer.css        # .cart-drawer slide-in panel
│   │   │   │   │   ├── checkout-errors.css    # .checkout-errors alert styles
│   │   │   │   │   ├── skeleton.css           # .skeleton shimmer animation
│   │   │   │   │   ├── island.css             # .island card/panel container
│   │   │   │   │   ├── nav-link.css           # .nav-link active/hover states
│   │   │   │   │   ├── icon-link.css          # .icon-link icon + label combos
│   │   │   │   │   ├── theme-toggle.css       # .theme-toggle button
│   │   │   │   │   ├── app-banner.css         # .app-banner mobile CTA strip
│   │   │   │   │   ├── wishlist-button.css    # .wishlist-button heart toggle
│   │   │   │   │   ├── toast.css              # .toast notification
│   │   │   │   │   ├── recommendation-row.css # .recommendation-row horizontal scroll
│   │   │   │   │   ├── recently-viewed-row.css # .recently-viewed-row horizontal scroll
│   │   │   │   │   ├── affiliate-disclosure.css # .affiliate-disclosure banner
│   │   │   │   │   ├── content-list-card.css  # .content-list-card article preview
│   │   │   │   │   ├── content-product-card.css # .content-product-card inline product
│   │   │   │   │   ├── related-content.css    # .related-content sidebar
│   │   │   │   │   ├── share-button.css       # .share-button
│   │   │   │   │   ├── cookie-consent.css     # .cookie-consent banner
│   │   │   │   │   └── faq-accordion.css      # .faq-accordion expand/collapse
│   │   │   │   │
│   │   │   │   └── pages/                     # 18 page-specific BEM blocks
│   │   │   │       ├── home.css               # .home-page hero, featured sections
│   │   │   │       ├── about.css              # .about-page
│   │   │   │       ├── products.css           # .products-page layout + filter sidebar
│   │   │   │       ├── search.css             # .search-page
│   │   │   │       ├── cart.css               # .cart-page
│   │   │   │       ├── checkout.css           # .checkout-page
│   │   │   │       ├── confirmation.css       # .confirmation-page order success
│   │   │   │       ├── lookup.css             # .lookup-page guest order form
│   │   │   │       ├── orders.css             # .orders-page order history
│   │   │   │       ├── profile.css            # .profile-page account settings
│   │   │   │       ├── auth.css               # .auth-page login/signup forms
│   │   │   │       ├── wishlist.css           # .wishlist-page saved items
│   │   │   │       ├── content.css            # .content-page article layout
│   │   │   │       ├── content-list.css       # .content-list-page listing grid
│   │   │   │       ├── contact.css            # .contact-page support form
│   │   │   │       ├── faq.css                # .faq-page
│   │   │   │       ├── legal.css              # .legal-page privacy/terms layout
│   │   │   │       └── admin.css              # .admin-page dashboard layout
│   │   │   │
│   │   │   └── __tests__/                     # Root-level test files (31 files)
│   │   │       │                              # Component tests live alongside components in __tests__/
│   │   │       ├── setup.ts                   # Vitest global setup (mocks, env)
│   │   │       ├── minimal.test.tsx           # Smoke test — verifies test infrastructure
│   │   │       ├── supabaseClient.test.ts     # Supabase client initialization tests
│   │   │       ├── rlsPolicy.test.ts          # Row-Level Security policy unit tests
│   │   │       ├── rlsPolicy.integration.test.ts # RLS integration tests (real DB)
│   │   │       ├── useAuthSession.test.tsx    # Auth session hook tests
│   │   │       ├── authFunctions.test.ts      # Auth function tests
│   │   │       ├── authForms.test.tsx         # Login/signup form interaction tests
│   │   │       ├── violetAuth.test.ts         # Violet token management tests
│   │   │       ├── profileSchemas.test.ts     # Profile Zod schema validation tests
│   │   │       ├── useTracking.test.ts        # Tracking hook tests
│   │   │       ├── personalization.test.ts    # Personalized search tests
│   │   │       ├── wishlist.test.ts           # Wishlist client tests
│   │   │       ├── recommendations.test.ts    # Recommendations client tests
│   │   │       ├── recently-viewed.test.ts    # Recently viewed history tests
│   │   │       ├── notification-preferences.test.ts
│   │   │       ├── deep-link.test.ts          # Universal link / deep link tests
│   │   │       ├── content-list.test.ts       # Content listing tests
│   │   │       ├── content.test.ts            # Content detail tests
│   │   │       ├── seo-advanced.test.ts       # Open Graph / structured data tests
│   │   │       ├── generate-sitemap.test.ts   # Sitemap generation tests
│   │   │       ├── useShare.test.ts           # Share hook tests
│   │   │       ├── ShareButton.test.ts        # ShareButton component tests
│   │   │       ├── faq.test.ts                # FAQ data + filter tests
│   │   │       ├── submitSupportHandler.test.ts
│   │   │       ├── contentAdmin.test.ts       # Content admin operation tests
│   │   │       ├── support.test.ts            # Support inquiry submission tests
│   │   │       ├── admin-support.test.ts      # Admin support management tests
│   │   │       ├── admin-health.test.ts       # Health monitoring tests
│   │   │       ├── admin.test.ts              # Admin dashboard tests
│   │   │       └── legal-pages.test.ts        # Legal content page tests
│   │   │
│   │   ├── router.tsx                         # TanStack Router config: SSR, scroll restoration,
│   │   │                                      # intent-based preloading, error boundaries
│   │   ├── vite.config.ts                     # Vite + TanStack Start plugin config;
│   │   │                                      # Vitest config (jsdom, coverage) defined inline
│   │   └── package.json                       # Web app dependencies
│   │
│   └── mobile/                                # Expo SDK 55 mobile app (React Native 0.83.2)
│       ├── src/
│       │   │
│       │   ├── app/                           # File-based routing via expo-router
│       │   │   ├── _layout.tsx                # Root layout: AuthProvider > StripeProvider > ThemeProvider
│       │   │   ├── index.tsx                  # Home tab
│       │   │   ├── search.tsx                 # Search tab
│       │   │   ├── wishlist.tsx               # Wishlist tab (requires auth)
│       │   │   ├── cart.tsx                   # Cart tab
│       │   │   ├── profile.tsx                # Profile tab
│       │   │   ├── checkout.tsx               # Modal: Stripe PaymentSheet checkout
│       │   │   │
│       │   │   ├── auth/
│       │   │   │   ├── _layout.tsx            # Auth stack layout
│       │   │   │   ├── _pending.ts            # Loading state for auth routes
│       │   │   │   ├── login.tsx              # Login screen (password + biometric)
│       │   │   │   ├── signup.tsx             # Registration screen
│       │   │   │   └── verify.tsx             # Email verification screen
│       │   │   │
│       │   │   ├── products/
│       │   │   │   ├── _layout.tsx            # Products stack layout
│       │   │   │   ├── index.tsx              # Product listing screen
│       │   │   │   └── [productId].tsx        # Product detail screen
│       │   │   │
│       │   │   ├── order/
│       │   │   │   ├── _layout.tsx            # Order stack layout
│       │   │   │   ├── lookup.tsx             # Guest order lookup screen
│       │   │   │   └── [orderId]/
│       │   │   │       └── confirmation.tsx   # Order confirmation screen
│       │   │   │
│       │   │   ├── content/
│       │   │   │   ├── _layout.tsx            # Content stack layout
│       │   │   │   ├── index.tsx              # Editorial content listing screen
│       │   │   │   └── [slug].tsx             # Content detail screen
│       │   │   │
│       │   │   ├── help/
│       │   │   │   ├── _layout.tsx            # Help stack layout
│       │   │   │   ├── index.tsx              # FAQ screen
│       │   │   │   └── contact.tsx            # Contact form screen
│       │   │   │
│       │   │   ├── settings/
│       │   │   │   ├── _layout.tsx            # Settings stack layout
│       │   │   │   └── notifications.tsx      # Push notification preferences screen
│       │   │   │
│       │   │   ├── legal/
│       │   │   │   ├── _layout.tsx            # Legal stack layout
│       │   │   │   └── [slug].tsx             # Dynamic legal pages screen
│       │   │   │
│       │   │   └── explore.tsx                # Explore tab (discovery)
│       │   │
│       │   ├── components/                    # React Native components
│       │   │   ├── product/
│       │   │   │   ├── ProductCard.tsx        # Native product tile
│       │   │   │   ├── ProductList.tsx        # FlatList-backed product list
│       │   │   │   └── ProductDetail.tsx      # Full native product detail view
│       │   │   ├── ui/
│       │   │   │   └── collapsible.tsx        # Animated accordion component
│       │   │   ├── BiometricPrompt.tsx        # Face ID / Touch ID prompt overlay
│       │   │   ├── BiometricToggle.tsx        # Settings toggle to enable biometric auth
│       │   │   ├── Skeleton.tsx               # RN skeleton loading component
│       │   │   ├── ContentCard.tsx            # Editorial content preview card
│       │   │   ├── app-tabs.tsx               # Bottom tab bar (native)
│       │   │   ├── app-tabs.web.tsx            # Bottom tab bar (web/Expo web override)
│       │   │   ├── animated-icon.tsx          # Animated tab icon (native)
│       │   │   ├── animated-icon.web.tsx      # Animated tab icon (web override)
│       │   │   ├── themed-text.tsx            # Text with theme-aware color
│       │   │   ├── themed-view.tsx            # View with theme-aware background
│       │   │   ├── external-link.tsx          # Opens URLs in system browser
│       │   │   ├── hint-row.tsx               # Contextual hint / tip row component
│       │   │   └── web-badge.tsx              # Badge component (web-specific)
│       │   │
│       │   ├── context/
│       │   │   └── AuthContext.tsx            # Auth state provider: Supabase session +
│       │   │                                  # biometric enrollment state
│       │   │
│       │   ├── hooks/                         # Mobile-specific hooks (4 files)
│       │   │   ├── use-theme.ts               # Resolves current color scheme (light/dark)
│       │   │   ├── use-color-scheme.ts        # Native color scheme detection
│       │   │   ├── use-color-scheme.web.ts    # Web override for color scheme detection
│       │   │   ├── useMobileTracking.ts       # App event tracking (screen views, taps)
│       │   │   └── usePushRegistration.ts     # Expo push token registration + Supabase storage
│       │   │
│       │   ├── services/
│       │   │   └── biometricService.ts        # Full biometric auth service: enrollment,
│       │   │                                  # verification, credential storage (expo-local-auth)
│       │   │
│       │   ├── constants/
│       │   │   └── theme.ts                   # Design tokens for React Native (colors,
│       │   │                                  # typography, spacing as JS constants)
│       │   │
│       │   └── utils/
│       │       ├── authInit.ts                # Supabase + Violet session initialization on app start
│       │       └── biometricLabel.ts          # Returns platform-specific label ("Face ID" / "Touch ID")
│       │
│       ├── assets/                            # Static assets
│       │   └── images/                        # App icons, splash screen, tab icons
│       │       └── tabIcons/                  # home.png, explore.png (@2x, @3x variants)
│       │
│       ├── app.config.ts                      # Expo config: bundle ID, deep linking schemes,
│       │                                      # plugins (expo-router, stripe, notifications)
│       ├── eas.json                           # EAS Build profiles (development, preview, production)
│       └── package.json                       # Mobile app dependencies (Expo SDK 55 pins)
│
├── packages/
│   │
│   ├── shared/                                # @ecommerce/shared — shared business logic
│   │   │                                      # No build step; consumed as TS source via workspace:*
│   │   └── src/
│   │       │
│   │       ├── types/                         # TypeScript type definitions (25 files)
│   │       │   ├── index.ts                   # Re-exports all types
│   │       │   ├── product.types.ts           # Product, SKU, Variant, Merchant
│   │       │   ├── cart.types.ts              # Cart, Bag, CartItem, CartStatus
│   │       │   ├── order.types.ts             # Order, OrderItem, OrderStatus, Refund
│   │       │   ├── orderPersistence.types.ts  # Local order persistence (guest tokens)
│   │       │   ├── user.types.ts              # User, UserProfile
│   │       │   ├── auth.types.ts              # AuthSession, AuthState
│   │       │   ├── biometric.types.ts         # BiometricCapability, BiometricResult
│   │       │   ├── profile.types.ts           # UserProfile, ProfileUpdatePayload
│   │       │   ├── search.types.ts            # SearchQuery, SearchResult, SearchFilters
│   │       │   ├── personalization.types.ts   # PersonalizationContext, BrowsingSignal
│   │       │   ├── tracking.types.ts          # TrackEvent, EventType, EventPayload
│   │       │   ├── wishlist.types.ts          # WishlistItem, WishlistState
│   │       │   ├── recommendation.types.ts    # RecommendationResult, SimilarityScore
│   │       │   ├── recentlyViewed.types.ts    # RecentlyViewedItem, ViewHistory
│   │       │   ├── notification.types.ts      # NotificationPreferences, PushToken
│   │       │   ├── content.types.ts           # ContentPage, ContentType, ContentStatus
│   │       │   ├── faq.types.ts               # FaqCategory, FaqEntry
│   │       │   ├── support.types.ts           # SupportInquiry, SupportStatus
│   │       │   ├── admin.types.ts             # AdminMetrics, CommissionData
│   │       │   ├── admin-support.types.ts     # AdminSupportView, InquiryReply
│   │       │   ├── health.types.ts            # ServiceHealth, HealthCheckResult
│   │       │   ├── violet.types.ts            # Violet.io API response shapes
│   │       │   ├── error.types.ts             # AppError, ErrorCode, ApiError
│   │       │   └── api.types.ts               # Generic API response wrappers
│   │       │
│   │       ├── clients/                       # Supabase data access layer (18 files)
│   │       │   ├── index.ts                   # Re-exports all clients
│   │       │   ├── supabase.ts                # Browser Supabase client factory
│   │       │   ├── supabase.server.ts         # Server-only Supabase client (service role)
│   │       │   ├── auth.ts                    # Supabase Auth operations (login, signup, OTP)
│   │       │   ├── profile.ts                 # User profile CRUD (avatar, preferences)
│   │       │   ├── biometricAuth.ts           # Biometric credential storage via Supabase
│   │       │   ├── violetAuth.ts              # Violet.io token exchange + refresh logic
│   │       │   ├── tracking.ts                # Event tracking client (calls track-event edge fn)
│   │       │   ├── wishlist.ts                # Wishlist add/remove/list operations
│   │       │   ├── notifications.ts           # Push token registration + preferences storage
│   │       │   ├── content.ts                 # Editorial content queries
│   │       │   ├── faq.ts                     # FAQ entries queries
│   │       │   ├── support.ts                 # Support inquiry submission
│   │       │   ├── admin.ts                   # Admin dashboard metrics queries
│   │       │   ├── admin-support.ts           # Admin support inquiry management
│   │       │   └── health.ts                  # Platform health status queries
│   │       │
│   │       ├── adapters/                      # Supplier abstraction layer (5 files + tests)
│   │       │   ├── index.ts                   # Re-exports adapter interface and factory
│   │       │   ├── supplierAdapter.ts         # SupplierAdapter interface definition
│   │       │   │                              # (catalog, cart, checkout, orders contracts)
│   │       │   ├── violetAdapter.ts           # Violet.io implementation of SupplierAdapter
│   │       │   └── adapterFactory.ts          # Returns the correct adapter for the env
│   │       │
│   │       ├── schemas/                       # Zod validation schemas (11 files)
│   │       │   ├── index.ts                   # Re-exports all schemas
│   │       │   ├── product.schema.ts          # Product query params + response validation
│   │       │   ├── cart.schema.ts             # Cart operations input validation
│   │       │   ├── search.schema.ts           # Search query + filters validation
│   │       │   ├── profile.schema.ts          # Profile update payload validation
│   │       │   ├── webhook.schema.ts          # Violet webhook event validation (16 event types)
│   │       │   ├── wishlist.schema.ts         # Wishlist operation validation
│   │       │   └── recommendation.schema.ts  # Recommendation request validation
│   │       │
│   │       ├── hooks/                         # TanStack Query hooks (21 files)
│   │       │   ├── index.ts                   # Re-exports all hooks
│   │       │   ├── useProducts.ts             # Product listing query (filters, pagination)
│   │       │   ├── useProduct.ts              # Single product query
│   │       │   ├── useSearch.ts               # Semantic search query hook
│   │       │   ├── useCart.ts                 # Cart state + mutations
│   │       │   ├── useCartSync.ts             # Cross-device cart sync (Supabase Realtime)
│   │       │   ├── useOrders.ts               # Order history queries
│   │       │   ├── useAuth.ts                 # Auth state observer
│   │       │   ├── useProfile.ts              # Profile query + update mutation
│   │       │   ├── useTracking.ts             # Tracking event dispatch hook
│   │       │   ├── useWishlist.ts             # Wishlist query + toggle mutation
│   │       │   ├── useBrowsingHistory.ts      # Browsing history tracking hook
│   │       │   ├── useRecommendations.ts      # AI product recommendations query
│   │       │   ├── useRecentlyViewed.ts       # Recently viewed products query
│   │       │   ├── useNotificationPreferences.ts # Push notification prefs query + update
│   │       │   ├── useContent.ts              # Editorial content queries
│   │       │   ├── useShare.ts                # Share API hook (native share / clipboard)
│   │       │   └── useProduct.ts              # (single product — see above)
│   │       │
│   │       └── utils/                         # Pure utility functions (18 files)
│   │           ├── index.ts                   # Re-exports all utilities
│   │           ├── formatPrice.ts             # Currency formatting (Intl.NumberFormat)
│   │           ├── seo.ts                     # Open Graph + structured data helpers
│   │           ├── deepLink.ts                # Universal link / deep link URL builders
│   │           ├── guestToken.ts              # Guest order token generation + storage
│   │           ├── orderPersistence.ts        # Local order ID persistence (localStorage)
│   │           ├── orderStatusDerivation.ts   # Derives display status from Violet order state
│   │           ├── authErrors.ts              # Auth error code → user-facing message map
│   │           ├── errorLogger.ts             # Structured error logging (Supabase error_logs)
│   │           ├── stripHtml.ts               # Strips HTML tags from strings
│   │           ├── stripMarkdown.ts           # Strips Markdown syntax from strings
│   │           ├── contentValidation.ts       # Content page field validation helpers
│   │           ├── constants.ts               # Shared app-wide constants
│   │           └── server.ts                  # Server-only utility guards
│   │
│   ├── ui/                                    # @ecommerce/ui — cross-platform design tokens
│   │   └── src/
│   │       ├── tokens/
│   │       │   ├── colors.ts                  # Semantic color palette (brand, neutral, status)
│   │       │   ├── typography.ts              # Font families, sizes, weights, line heights
│   │       │   ├── spacing.ts                 # Spacing scale (4px base unit)
│   │       │   └── index.ts                   # Re-exports all tokens
│   │       └── index.ts                       # Package entry point
│   │
│   └── config/                                # @ecommerce/config — shared tooling configuration
│       ├── tsconfig.base.json                 # Base TypeScript config (strict, ESNext, bundler res.)
│       └── eslint.base.js                     # Base ESLint rules extended by each app
│
├── supabase/                                  # Supabase infrastructure
│   │
│   ├── migrations/                            # 36 SQL migration files (chronological)
│   │   │                                      # Naming: YYYYMMDDHHMMSS_description.sql
│   │   ├── 20260306000000_create_user_profiles.sql
│   │   ├── 20260310000000_add_biometric_enabled.sql
│   │   ├── 20260311000000_add_anonymous_restrictive_policy.sql
│   │   ├── 20260311000001_auto_create_user_profile.sql
│   │   ├── 20260313000000_product_embeddings.sql    # pgvector extension + embeddings table
│   │   ├── 20260313100000_webhook_events.sql        # Violet webhook event log
│   │   ├── 20260313100001_add_product_availability.sql
│   │   ├── 20260314000000_carts.sql                 # Cart persistence tables
│   │   ├── 20260315000000_cart_items_product_info.sql
│   │   ├── 20260316000000_enable_carts_realtime.sql # Supabase Realtime for cart sync
│   │   ├── 20260317000000_error_logs.sql            # Error tracking table
│   │   ├── 20260318000000_epic4_review_fixes.sql
│   │   ├── 20260319000000_orders.sql                # Orders + order items tables + RLS
│   │   ├── 20260320000000_orders_realtime.sql
│   │   ├── 20260321000000_order_refunds.sql
│   │   ├── 20260322000000_notification_logs.sql
│   │   ├── 20260323000000_epic5_review_fixes.sql
│   │   ├── 20260324000000_user_profiles_extend.sql  # Extended profile fields
│   │   ├── 20260325000000_user_events.sql           # User event tracking table
│   │   ├── 20260326000000_search_personalization.sql # Personalization signals table
│   │   ├── 20260327000000_wishlists.sql
│   │   ├── 20260328000000_push_notifications.sql    # Push token storage
│   │   ├── 20260329000000_epic6_review_fixes.sql
│   │   ├── 20260330000000_content_pages.sql         # Editorial content CMS table
│   │   ├── 20260331000000_content_admin_enhancements.sql
│   │   ├── 20260401000000_faq_and_support.sql       # FAQ + support inquiry tables
│   │   ├── 20260402000000_admin_roles.sql           # Admin role claim + RLS
│   │   ├── 20260402000001_admin_views.sql           # Materialized views for dashboard
│   │   ├── 20260403000000_admin_support_rls.sql
│   │   ├── 20260404000000_health_monitoring.sql     # Service health log table
│   │   ├── 20260405000000_legal_content_type.sql    # Legal content type in CMS
│   │   ├── 20260405000001_legal_content_seed.sql    # Seed data for legal pages
│   │   └── 20260406000000_epic8_review_fixes.sql
│   │
│   ├── functions/                             # Deno Edge Functions (12 functions)
│   │   │
│   │   ├── _shared/                           # Shared utilities imported by all functions
│   │   │   ├── cors.ts                        # CORS headers helper
│   │   │   ├── supabaseAdmin.ts               # Service-role Supabase client
│   │   │   ├── violetAuth.ts                  # Violet token management for edge runtime
│   │   │   ├── webhookAuth.ts                 # HMAC webhook signature verification
│   │   │   ├── openai.ts                      # OpenAI client factory (embeddings)
│   │   │   ├── personalization.ts             # Personalization context helpers
│   │   │   └── schemas.ts                     # Shared Zod schemas for edge functions
│   │   │
│   │   ├── cart/
│   │   │   └── index.ts                       # Full Violet cart proxy for mobile app
│   │   │                                      # (add, update, remove, submit endpoints)
│   │   │
│   │   ├── generate-embeddings/
│   │   │   └── index.ts                       # Generates OpenAI embeddings for new/updated products
│   │   │                                      # Triggered by DB webhook on product_embeddings table
│   │   │
│   │   ├── get-recommendations/
│   │   │   └── index.ts                       # Returns semantically similar products
│   │   │                                      # using pgvector cosine similarity
│   │   │
│   │   ├── guest-order-lookup/
│   │   │   └── index.ts                       # Guest order retrieval by email token or OTP
│   │   │
│   │   ├── handle-webhook/
│   │   │   ├── index.ts                       # Violet webhook router (validates HMAC signature)
│   │   │   ├── processors.ts                  # Event processors: product, cart, shipping events
│   │   │   └── orderProcessors.ts             # Order-specific event processors
│   │   │                                      # (16 event types: order.*, shipment.*, refund.*)
│   │   │
│   │   ├── health-check/
│   │   │   └── index.ts                       # Pings Violet, Supabase, OpenAI; writes results
│   │   │                                      # to health_checks table
│   │   │
│   │   ├── search-products/
│   │   │   └── index.ts                       # Semantic product search: vectorizes query,
│   │   │                                      # runs pgvector similarity, applies personalization
│   │   │
│   │   ├── send-notification/
│   │   │   ├── index.ts                       # Transactional email dispatcher (Resend)
│   │   │   ├── types.ts                       # Notification event type definitions
│   │   │   └── templates.ts                   # Email HTML templates
│   │   │
│   │   ├── send-push/
│   │   │   ├── index.ts                       # Expo push notification dispatcher
│   │   │   └── types.ts                       # Push payload type definitions
│   │   │
│   │   ├── send-support-email/
│   │   │   └── index.ts                       # Sends support inquiry acknowledgment email
│   │   │
│   │   ├── send-support-reply/
│   │   │   └── index.ts                       # Sends admin reply to user's support email
│   │   │
│   │   └── track-event/
│   │       └── index.ts                       # Persists user events to user_events table
│   │                                          # with deduplication + anonymous support
│   │
│   ├── seed.sql                               # Local dev seed data
│   └── config.toml                            # Supabase local dev config (ports, auth settings)
│
├── scripts/                                   # Build-time scripts
│   ├── generate-sitemap.ts                    # Generates sitemap.xml from DB content + static routes
│   └── sitemap-utils.ts                       # URL builder helpers for sitemap generation
│
├── docs/                                      # Project documentation
│   ├── source-tree-analysis.md                # This file — annotated directory structure
│   ├── project-overview.md                    # High-level project summary
│   ├── violet-io-integration-guide.md         # Violet.io integration patterns + gotchas
│   ├── violet-io-action-plan.md               # Violet API migration / action plan
│   ├── VIOLET_QUICK_REFERENCE.md              # Quick-reference for Violet API endpoints
│   ├── supabase-local-setup.md                # Local Supabase setup instructions
│   ├── content-administration-guide.md        # CMS content management via Supabase Studio
│   ├── IMPLEMENTATION-ROADMAP-2026.md         # Feature roadmap with timelines
│   ├── google-ucp-strategy-2026.md            # Google UCP / SEO strategy document
│   ├── supplier-comparison-strategy.md        # Violet vs. alternative supplier comparison
│   ├── firmly-ai-exploration-guide.md         # Firmly.ai API exploration notes
│   └── project-scan-report.json              # Automated codebase scan report (machine-readable)
│
├── .github/
│   └── workflows/                             # CI/CD pipelines (4 workflows)
│       ├── web-deploy.yml                     # Deploys web app on push to main
│       ├── edge-functions-deploy.yml          # Deploys Supabase edge functions
│       ├── mobile-build.yml                   # EAS Build trigger for mobile app
│       └── semgrep.yml                        # Static security analysis (Semgrep)
│
├── _bmad/                                     # BMAD framework configuration
│
├── _bmad-output/                              # BMAD planning and implementation artifacts
│   ├── brainstorming/                         # Initial brainstorming sessions
│   ├── planning-artifacts/                    # PRD, architecture doc, epics, UX spec, research
│   │   └── research/                          # Market, technical, and domain research docs
│   ├── implementation-artifacts/              # Per-story implementation files
│   │   │                                      # Format: {epic#}-{story#}-{slug}.md (48 stories)
│   │   └── sprint-status.yaml                 # Current sprint status tracker
│   └── project-context.md                     # Project context snapshot for AI agents
│
├── package.json                               # Root monorepo config (Bun workspaces, root scripts)
├── tsconfig.base.json                         # Shared TypeScript base config (strict, ESNext)
├── eslint.config.js                           # Root ESLint flat config (extends packages/config)
├── .prettierrc                                # Prettier: double quotes, semicolons, 100 char width
├── CLAUDE.md                                  # AI agent instructions (architecture, constraints)
└── violet-ai-llms-txt.md                      # Violet.io documentation index for AI consumption
```

---

## Critical Folders Summary

| Directory                                | Purpose                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/`                   | All 27 web pages. Start here to understand user-facing features. Each file maps 1:1 to a URL.                                                            |
| `apps/web/src/server/`                   | TanStack Start server functions — the only place where secrets, Violet API calls, and admin logic run. Never bundled to the client.                      |
| `apps/web/src/components/`               | All React UI components, organized by domain (product, search, checkout, content, admin).                                                                |
| `apps/web/src/styles/`                   | The entire CSS codebase. Vanilla CSS + BEM. `tokens.css` is the single source of truth for design values. Import order in `index.css` must be preserved. |
| `apps/mobile/src/app/`                   | All mobile screens. expo-router file-based routing mirrors the web route structure.                                                                      |
| `packages/shared/src/types/`             | Canonical TypeScript types shared across web, mobile, and edge functions. Modify types here, not in app code.                                            |
| `packages/shared/src/clients/`           | All Supabase database interactions. The only layer that should call Supabase APIs directly.                                                              |
| `packages/shared/src/adapters/`          | Supplier abstraction — `SupplierAdapter` interface + `VioletAdapter`. If a second supplier is added, implement a new adapter here.                       |
| `packages/shared/src/hooks/`             | TanStack Query hooks consumed by both web and mobile. Business logic for data fetching lives here.                                                       |
| `supabase/migrations/`                   | The complete database schema history. Run in chronological order. Do not edit existing migrations — add new ones.                                        |
| `supabase/functions/`                    | Deno edge functions for workloads that cannot run in the browser: AI search, webhook processing, email/push dispatch, health monitoring.                 |
| `supabase/functions/_shared/`            | Utilities shared across all edge functions (CORS, auth, OpenAI, Violet). Changes here affect every function.                                             |
| `_bmad-output/implementation-artifacts/` | One Markdown file per story (48 total across 8 epics). Reference for implementation decisions and acceptance criteria.                                   |
| `.github/workflows/`                     | CI/CD: web deployment, edge function deployment, mobile EAS build, and Semgrep security scan.                                                            |
