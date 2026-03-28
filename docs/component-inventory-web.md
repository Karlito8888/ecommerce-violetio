# Component Inventory — Web (`apps/web/src/components`)

All React components in the web application. Organized by domain.

---

## Global (5 components)

### `Header`

**File:** `components/Header.tsx`
**Props:** none (reads `useUser()` internally)
**Purpose:** Site header with brand logo ("Maison Émile"), compact `SearchBar`, account/wishlist/cart icon links, `ThemeToggle`, and responsive hamburger menu. Wishlist icon is rendered only for authenticated non-anonymous users (AC #8). Category nav links (`New`, `Fashion`, `Home & Living`, `About`) drive the products page via URL search params.

---

### `Footer`

**File:** `components/Footer.tsx`
**Props:** none
**Purpose:** Site footer with four link columns (Shop, Company, Support, Legal), Instagram/Pinterest social links, affiliate disclosure text, and copyright year. Exports `FOOTER_SECTIONS` constant for reuse/testing.

---

### `ThemeToggle`

**File:** `components/ThemeToggle.tsx`
**Props:** none
**Purpose:** Cycles through `light → dark → auto` theme modes. Applies theme by toggling CSS classes and `data-theme` on `<html>`. Persists choice to `localStorage`. In `auto` mode, listens to `prefers-color-scheme` media query changes.

---

### `AppBanner`

**File:** `components/AppBanner.tsx`
**Props:** none (reads `useAppBanner()` internally)
**Purpose:** Dismissible top-of-page banner promoting the mobile app. Reads `visible` state from `useAppBanner` hook; renders nothing when dismissed. Dismiss button writes to localStorage via the hook.

---

### `Skeleton`

**File:** `components/Skeleton.tsx`
**Props:** `variant?: "text" | "image" | "card"`, `width?: string`, `height?: string`, `className?: string`
**Purpose:** Generic animated placeholder for loading states. Used by `ProductGridSkeleton` and `ProductDetailSkeleton`. Has `role="status"` and `aria-label="Loading"` for accessibility.

---

## Product (16 components)

### `ProductCard`

**File:** `components/product/ProductCard.tsx`
**Props:** `product: Product`
**Purpose:** Catalog listing card. Thin wrapper over `BaseProductCard` that maps `Product.seller` to `merchantName`. Used in `ProductGrid`.

---

### `SearchProductCard`

**File:** `components/search/SearchProductCard.tsx`
**Props:** `product: ProductMatch`
**Purpose:** Search result card. Thin wrapper over `BaseProductCard` that maps `ProductMatch.vendor` to `merchantName`. Used in `SearchResults`.

---

### `BaseProductCard`

**File:** `components/product/BaseProductCard.tsx`
**Props:** `id: string`, `name: string`, `merchantName: string`, `thumbnailUrl: string | null`, `available: boolean`, `minPrice: number`, `currency: string`
**Purpose:** Shared product card markup used by both `ProductCard` and `SearchProductCard`. Renders image (with SVG placeholder on error or null), "Sold Out" badge, name, merchant, price, and an overlaid `WishlistButton`. The `<article>` wraps a `<Link>` to `/products/$productId`. On image load error, falls through to the SVG placeholder instead of hiding the card.

---

### `ProductGrid`

**File:** `components/product/ProductGrid.tsx`
**Props:** `products: Product[]`
**Purpose:** Responsive CSS Grid of `ProductCard` components. 2 columns on mobile, 3 on tablet, 4 on desktop. Has `role="list"` with `role="listitem"` wrappers.

---

### `ProductDetail`

**File:** `components/product/ProductDetail.tsx`
**Props:** `product: Product`
**Purpose:** Full product detail page layout. Contains `ImageGallery`, `VariantSelector`, `PriceBreakdown`, `WishlistButton`, `ShareButton`, and `RecommendationRow`. Manages variant selection state (`selectedValues`) and resolves the matching `SKU`. Strips HTML from `product.htmlDescription` via `stripHtml()` before rendering. Wires `addToCartFn` Server Function through the `useAddToCart` mutation and `CartContext`.

---

### `ImageGallery`

**File:** `components/product/ImageGallery.tsx`
**Props:** `images: ProductImage[]`, `productName: string`
**Purpose:** Hero image + thumbnail strip. Sorts images by `displayOrder`, identifies primary via `image.primary`, tracks active index with local state. Hero is eager-loaded (above fold); thumbnails are lazy. Shows SVG placeholder when `images` is empty.

---

### `VariantSelector`

**File:** `components/product/VariantSelector.tsx`
**Props:** `variants: ProductVariant[]`, `skus: SKU[]`, `selectedValues: Record<string, string>`, `onSelect: (variantName, value) => void`
**Purpose:** Renders one `role="radiogroup"` per variant dimension (Size, Color, etc.). Each value button is `disabled` (not just `aria-disabled`) when no in-stock SKU matches the hypothetical selection. Calls `onSelect` which updates parent state.

---

### `PriceBreakdown`

**File:** `components/product/PriceBreakdown.tsx`
**Props:** `selectedSku: SKU | null`, `minPrice: number`, `maxPrice: number`, `currency: string`
**Purpose:** Transparent pricing `<dl>` on the product detail page. Shows price range when no SKU is selected, sale/original prices when a discounted SKU is selected, shipping and tax as "Calculated at checkout". All amounts are integer cents passed through `formatPrice()`.

---

### `WishlistButton`

**File:** `components/product/WishlistButton.tsx`
**Props:** `productId: string`, `productName?: string`, `className?: string`, `size?: "sm" | "md"`
**Purpose:** Heart icon toggle (♡/♥) for authenticated users. Uses `useIsInWishlist`, `useAddToWishlist`, `useRemoveFromWishlist` from `@ecommerce/shared`. Shows `useToast()` feedback on add/remove. Renders nothing for guests and anonymous users. Wrapped in `WishlistBoundary` (error boundary) for safe rendering in test contexts without a `QueryClientProvider`.

---

### `RecommendationRow`

**File:** `components/product/RecommendationRow.tsx`
**Props:** `productId: string`
**Purpose:** "You might also like" horizontal row on product detail pages. Fetches from `useRecommendations`. Renders 4 skeleton placeholders while loading, nothing on error or empty results. Uses `BaseProductCard` with `product.vendor` as `merchantName`. Wrapped in `RecommendationBoundary`.

---

### `RecentlyViewedRow`

**File:** `components/product/RecentlyViewedRow.tsx`
**Props:** none (reads user from `useUser()` internally)
**Purpose:** "Recently Viewed" horizontal row on the homepage. Fetches IDs via `useRecentlyViewed`, then fetches live product data in parallel using `useQueries` + `productDetailQueryOptions`. Preserves recently-viewed order in the final product list. Uses `<h2>` for correct heading hierarchy. Wrapped in `RecentlyViewedBoundary`.

---

### `CategoryChips`

**File:** `components/product/CategoryChips.tsx`
**Props:** `categories: CategoryItem[]`, `activeCategory: string | undefined`, `onCategoryChange: (category: string | undefined) => void`
**Purpose:** Horizontal scrollable chip nav for category filtering on the products listing page. Categories come from the route loader (not hardcoded) to support live Violet API data. Each chip is a `<button>` with `aria-pressed` inside a `<nav>`.

---

### `FilterChips`

**File:** `components/product/FilterChips.tsx`
**Props:** `activeFilters: ActiveFilters`, `onFilterChange: (filters: ActiveFilters) => void`
**Purpose:** Price and availability filter chips. Five predefined price ranges (cents) plus an "In Stock" toggle. Price chips are mutually exclusive; "In Stock" combines with any price chip; "All" clears everything. Uses `<fieldset>` with a `.sr-only` `<legend>` for accessible grouping.

---

### `SortSelect`

**File:** `components/product/SortSelect.tsx`
**Props:** `sortBy?: "relevance" | "price"`, `sortDirection?: "ASC" | "DESC"`, `onSortChange: (sortBy, sortDirection?) => void`
**Purpose:** Native `<select>` dropdown for product sort order. Options: Relevance, Price Low to High, Price High to Low. Encodes `sortBy` + `sortDirection` as a single string value and parses it back on change.

---

### `ProductGridSkeleton`

**File:** `components/product/ProductGridSkeleton.tsx`
**Props:** none
**Purpose:** Loading state for the products listing page. Renders 12 placeholder cards (matching default page size) using `Skeleton` components in the same grid layout as `ProductGrid`. Has `role="status"` and `aria-label`.

---

### `ProductDetailSkeleton`

**File:** `components/product/ProductDetailSkeleton.tsx`
**Props:** none
**Purpose:** Loading state for the product detail page. Matches the two-column layout with a large image skeleton on the left and text line skeletons on the right.

---

## Search (3 components)

### `SearchBar`

**File:** `components/search/SearchBar.tsx`
**Props:** `variant?: "compact" | "hero"`, `initialQuery?: string`, `autoFocus?: boolean`
**Purpose:** Unified search bar for two contexts. `compact` variant: header-integrated, 400px max. `hero` variant: full-width homepage with animated rotating placeholder and trending suggestions. Keyboard navigation: Enter submits (min 2 chars), Escape clears, ArrowDown moves focus to first suggestion (hero), ArrowUp/Down cycle through suggestions. Navigates to `/search?q=...` on submit.

---

### `SearchResults`

**File:** `components/search/SearchResults.tsx`
**Props:** `products: ProductMatch[]`, `explanations: MatchExplanations`, `query: string`, `isLoading: boolean`, `error: Error | null`, `personalized?: boolean`, `personalizationHint?: string`
**Purpose:** Displays AI search results. Four-state machine: loading (8 skeleton cards), error (`role="alert"`), empty (with suggestion), results (grid with per-product AI explanation text). Has `aria-live="polite"` on the results wrapper. Exports `SearchResultsSkeleton` separately for reuse.

---

## Checkout (5 components)

### `CartRecovery`

**File:** `components/checkout/CartRecovery.tsx`
**Props:** `cartHealth: CartHealthStatus`, `onStartFresh: () => void`, `onRetry: () => void`
**Purpose:** Shown when the cart is in an unhealthy state. `stale` state: spinner with "Refreshing your cart…". `expired`/`invalid` states: `role="alertdialog"` with a specific, honest message and action buttons (Start Fresh, Try Again). Renders nothing when `cartHealth === "healthy"`.

---

### `CheckoutErrorBoundary`

**File:** `components/checkout/CheckoutErrorBoundary.tsx`
**Props:** `children: ReactNode`, `onNavigateToCart?: () => void`
**Purpose:** Class-based React error boundary wrapping the checkout route tree. On unhandled error: logs to `error_logs` table via `logClientErrorFn` Server Function (fire-and-forget), then shows a fallback UI with Retry / Go to Cart buttons.

---

### `BagErrors`

**File:** `components/checkout/BagErrors.tsx`
**Props:** `errors: BagError[]`, `items: CartItem[]`, `merchantName: string`, `onRemoveItem?: (skuId) => void`, `onUpdateQuantity?: (skuId, quantity) => void`
**Purpose:** Per-merchant error list for Violet's 200-with-errors pattern. Shows inventory issues (out of stock, insufficient quantity) alongside item names. Each error has actionable buttons: "Set to 1" or "Remove". Has `role="alert"`.

---

### `InventoryAlert`

**File:** `components/checkout/InventoryAlert.tsx`
**Props:** `bags: Bag[]`, `onRemoveItem`, `onUpdateQuantity`, `onDismiss`, `isRevalidating: boolean`
**Purpose:** Pre-submit inventory validation failure overlay. Groups errors by merchant bag. Each item shows its error message and action buttons (Update qty, Remove). "Continue to checkout" button triggers re-validation. Has `role="alertdialog"`.

---

### `RetryPrompt`

**File:** `components/checkout/RetryPrompt.tsx`
**Props:** `operationName: string`, `retryCount: number`, `isRetrying: boolean`, `onRetry: () => void`, `onCancel: () => void`
**Purpose:** Shown when a checkout Server Function call times out or fails. Preserves all form state. User-initiated retry (not automatic). After 3 retries, hides the Retry button and shows "try again later" message with a Go Back button.

---

## Content (6 components)

### `MarkdownRenderer`

**File:** `components/content/MarkdownRenderer.tsx`
**Props:** `content: string`
**Purpose:** Renders editorial Markdown with inline product embeds (`{{product:ID}}`). Pipeline: split content at embed boundaries → Markdown segments parsed by `marked` → sanitized by `DOMPurify` → product segments rendered as `ContentProductCard`. External links get `target="_blank" rel="noopener noreferrer"`. Exports `splitContentWithEmbeds` and `renderMarkdownToHtml` for testing.

---

### `ContentProductCard`

**File:** `components/content/ContentProductCard.tsx`
**Props:** `productId: string`
**Purpose:** Horizontal inline product card for editorial pages. Fetches live product data via `productDetailQueryOptions` + `getProductFn` Server Function. Shows skeleton on loading, graceful error fallback with a plain link. Layout differs from `BaseProductCard`: horizontal, includes a "View Product" CTA button.

---

### `ContentListCard`

**File:** `components/content/ContentListCard.tsx`
**Props:** `content: ContentListItem`
**Purpose:** Card for the content listing grid. Displays featured image (with type-based CSS placeholder), type badge, title, excerpt from `seoDescription` (not generated from `body_markdown`), author, and publication date. Links to `/content/$slug`. Exports `generateExcerpt` utility for tests/other consumers.

---

### `ContentTypeFilter`

**File:** `components/content/ContentTypeFilter.tsx`
**Props:** `activeType: ContentType | undefined`, `onTypeChange: (type) => void`
**Purpose:** Horizontal chip row for filtering content by type: All, Guides, Comparisons, Reviews. Uses `aria-pressed` on each chip button.

---

### `RelatedContent`

**File:** `components/content/RelatedContent.tsx`
**Props:** `slugs: string[]`
**Purpose:** "Related Articles" section at the bottom of content detail pages. Fetches related articles by slug array via `getRelatedContentFn`. Uses `useQuery` (not `useSuspenseQuery`) to avoid blocking the main article render. Renders nothing if no slugs or no results.

---

### `AffiliateDisclosure`

**File:** `components/content/AffiliateDisclosure.tsx`
**Props:** none
**Purpose:** Legally required affiliate disclosure banner (FR11). Renders as `<aside role="note">` with standard disclosure text. Placed on every page that contains product links.

---

## Help (3 components)

### `FaqAccordion`

**File:** `components/help/FaqAccordion.tsx`
**Props:** `items: FaqItem[]`, `highlightedIds?: Set<string>`
**Purpose:** Native `<details>`/`<summary>` accordion for FAQ items. Zero-JS keyboard accessibility. Highlighted items (matching search query) get the `open` attribute and a BEM modifier class. Answers are Markdown rendered to HTML via `marked` and sanitized with `DOMPurify`. Has `role="region"` + `aria-labelledby` on each answer panel.

---

### `FaqSearch`

**File:** `components/help/FaqSearch.tsx`
**Props:** `value: string`, `onChange: (value: string) => void`
**Purpose:** Controlled search input for client-side FAQ filtering. `type="search"` for native semantics and clear button. Filtering logic lives in the parent (help page). Results count announced via `aria-live` region in the parent.

---

### `ContactForm`

**File:** `components/help/ContactForm.tsx`
**Props:** none
**Purpose:** Multi-field support inquiry form (name, email, subject dropdown, optional order ID, message). Client-side validation: name required, valid email, message 20–2000 chars. Includes a honeypot field hidden from assistive tech. Submits via `submitSupportFn` Server Function. Four states: idle, submitting, success, error. Each field uses `aria-invalid` + `aria-describedby` for accessible error messaging.

---

## Admin (4 components)

### `DashboardMetrics`

**File:** `components/admin/DashboardMetrics.tsx`
**Props:** `metrics: DashboardMetrics`
**Purpose:** KPI card grid for the admin dashboard. Displays Total Orders, Gross Revenue, Commission Earned, Active Users, Conversion Rate, and AI Search Usage. Revenue/commission formatted via `formatPrice` from cents.

---

### `CommissionTable`

**File:** `components/admin/CommissionTable.tsx`
**Props:** `data: CommissionSummary[]`
**Purpose:** Per-merchant commission breakdown table with a totals footer row. Columns: Merchant, Orders, Gross Subtotal, Rate, Commission. All monetary values in cents formatted via `formatPrice`. Uses `scope="col"` on headers for WCAG 1.3.1 compliance.

---

### `TimeRangeSelector`

**File:** `components/admin/TimeRangeSelector.tsx`
**Props:** `value: TimeRange`, `onChange: (params: TimeRangeParams) => void`
**Purpose:** Toggle button group for admin dashboard time ranges: Today, 7 Days, 30 Days, Custom. Custom mode reveals date pickers with an Apply button that only triggers when both dates are set. Uses `role="group"` + `aria-label` and `aria-pressed` on each button.

---

### `SupportStatusBadge`

**File:** `components/admin/SupportStatusBadge.tsx`
**Props:** `status: SupportInquiryStatus`
**Purpose:** Color-coded `<span>` badge for support inquiry status. Maps status to a BEM modifier class (`status-badge--{status}`). Text content conveys status without relying on color alone.

---

## Legal (1 component)

### `CookieConsentBanner`

**File:** `components/legal/CookieConsentBanner.tsx`
**Props:** none (reads `useCookieConsent()` internally)
**Purpose:** GDPR-compliant cookie consent dialog. Equal-weight Accept/Decline buttons (no dark patterns). Focus trap prevents keyboard users from leaving the banner before choosing. Auto-focuses on mount. Reads/writes consent state to `localStorage` via `useCookieConsent` hook. Has `role="dialog"`, `aria-modal="true"`, and `aria-label`.

---

## UI Primitives (2 components)

### `Toast` / `ToastProvider`

**File:** `components/ui/Toast.tsx`
**Props (provider):** `children: ReactNode`
**Purpose:** Lightweight toast notification system. `ToastProvider` holds the toast queue and mounts the overlay. `useToast()` hook exposes `toast.success(message)` and `toast.error(message)`. Toasts auto-dismiss after 4 seconds. Custom implementation (~1.5 KB) using design tokens. Has `role="status"` + `aria-live="polite"`.

---

### `ShareButton`

**File:** `components/ui/ShareButton.tsx`
**Props:** `url: string`, `title: string`, `text?: string`, `label?: string`, `className?: string`, `size?: "sm" | "md"`
**Purpose:** Share button using the Web Share API with a clipboard fallback. Shows `useToast()` feedback: "Link copied!" on clipboard success, "Shared!" on native share success. No toast on native share cancel (user-initiated dismissal). Prevents parent link navigation via `e.preventDefault()` + `e.stopPropagation()`.

---

## Cart (4 components + context)

### `CartContext` / `CartProvider` / `useCartContext`

**File:** `contexts/CartContext.tsx`
**Props (provider):** `children: ReactNode`, `initialVioletCartId?: string`, `initialCartId?: string`, `userId?: string`
**Purpose:** App-wide cart state: dual cart IDs (`cartId` for Supabase, `violetCartId` for Violet API), drawer open/close state, `cartHealth` for recovery logic, and `mergeError` for anonymous cart merge failures. Hydrated from the root route loader (HttpOnly cookie). Subscribes to Supabase Realtime via `useCartSync` when a user is authenticated. `CartProvider` renders `<CartDrawer />` internally. The `useCartContext()` hook throws if called outside the provider.

---

> Note: `CartDrawer` and other cart UI components exist in `apps/web/src/components/cart/` but are not listed here — the pattern is identical to other domains.
