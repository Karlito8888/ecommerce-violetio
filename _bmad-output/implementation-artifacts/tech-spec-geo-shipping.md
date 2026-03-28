---
title: 'Geo-Filtered Catalog & Delivery Estimates'
slug: 'geo-shipping'
created: '2026-03-28'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TanStack Start v1 (Vite 7.3 SSR)', 'React 19.2', 'Violet.io API', 'TanStack Query v5 (suspense-first)', 'Vanilla CSS + BEM', 'Zod 4.3', 'Vitest 3.0 + jsdom', 'Nginx geoip_module + MaxMind GeoLite2', 'country.is API (fallback)']
files_to_modify:
  - 'packages/shared/src/adapters/violetAdapter.ts'
  - 'packages/shared/src/types/product.types.ts'
  - 'packages/shared/src/schemas/product.schema.ts'
  - 'packages/shared/src/utils/constants.ts'
  - 'apps/web/src/server/getProducts.ts'
  - 'apps/web/src/server/getProduct.ts'
  - 'apps/web/src/components/product/BaseProductCard.tsx'
  - 'apps/web/src/components/product/ProductCard.tsx'
  - 'apps/web/src/components/product/ProductCard.css'
  - 'apps/web/src/components/product/ProductDetail.tsx'
  - 'apps/web/src/components/product/PriceBreakdown.tsx'
  - 'apps/web/src/features/cart/CartBag.tsx'
  - 'apps/web/src/styles/components/cart-drawer.css'
  - 'apps/web/src/components/Header.tsx'
  - 'apps/web/src/styles/components/header.css'
  - 'apps/web/src/routes/__root.tsx'
files_to_create:
  - 'apps/web/src/contexts/UserLocationContext.tsx'
  - 'apps/web/src/server/geoip.ts'
  - 'apps/web/src/components/CountrySelector.tsx'
  - 'apps/web/src/styles/components/country-selector.css'
  - 'packages/shared/src/utils/currency.ts'
  - 'packages/shared/src/types/shipping.types.ts'
code_patterns:
  - 'Adapter: all Violet snake_case -> camelCase in violetAdapter.ts, UI never sees Violet fields'
  - 'Context: createContext + custom useXxx hook + Provider (see CartContext.tsx)'
  - 'Cookie: TanStack Start setCookie/getCookie, HttpOnly, server functions'
  - 'Server functions: createServerFn for all server-side logic (no express middleware)'
  - 'Root loader: SSR entry point reads cookies, hydrates providers'
  - 'Components: named function exports, CSS import first, BEM classes'
  - 'Query keys: factory functions in constants.ts with const assertion'
  - 'Prices: integer cents everywhere, formatPrice() for display'
test_patterns:
  - 'Vitest + jsdom, direct React DOM (createRoot + act()), no @testing-library/react'
  - 'renderToContainer() helper per test file'
  - 'createMockXxx(overrides?) factory pattern for typed fixtures'
  - 'vi.mock for Router Link, hooks, contexts'
  - 'afterEach: manual DOM cleanup (remove all body children)'
  - '__tests__/ subfolder alongside source files'
---

# Tech-Spec: Geo-Filtered Catalog & Delivery Estimates

**Created:** 2026-03-28

## Overview

### Problem Statement

Users currently see all 39 products from the Violet sandbox regardless of their location. A French user sees US-only products they can't buy, and only discovers shipping failures late at checkout (`GET /shipping-methods`). There are no delivery estimates, no country awareness, and all prices display in USD regardless of the user's locale.

### Solution

Implement automatic geo-detection (Nginx GeoIP + fallback API), filter the catalog server-side by shipping zones, display delivery estimates on every product card and detail page, add a country selector to the header, integrate shipping info into the cart drawer, and show approximate local currency conversion — all while gracefully handling non-Shopify merchants who lack shipping zone data.

### Scope

**In Scope:**

- GeoIP detection via Nginx `geoip_module` (MaxMind GeoLite2) + `country.is` fallback
- `UserLocationContext` with cookie persistence
- `?include=shipping` on Violet catalog API calls
- Server-side filtering of offers by country (Shopify merchants)
- Fallback UX for non-Shopify merchants ("Shipping confirmed at checkout")
- Delivery estimate badges on product cards
- Shipping methods section on product detail page (PDP)
- Country selector in header (filtered to countries with deliverable products)
- Delivery info per bag in cart drawer
- Informational currency display (approximate conversion, client-side)
- "No products for your country" empty state

**Out of Scope:**

- Real currency conversion via Stripe/Violet payment flow
- Multi-address shipping support
- Per-country tax calculation
- Mobile app (Expo) — separate future spec
- Violet `sync_product_shipping` enablement (ops task, not code)

## Context for Development

### Codebase Patterns

**Adapter Layer:**
- `violetAdapter.ts` (1,437 lines) handles ALL Violet API communication and snake_case → camelCase mapping
- `getProducts`: `POST /catalog/offers/search` with 0-based pagination internally, 1-based externally
- `getProduct`: `GET /catalog/offers/{id}` — single offer fetch
- `getProductsFromMerchants`: demo fallback — fetches merchants list then offers per merchant in parallel
- `transformOffer` (line 378): maps raw Violet offer → internal `Product` type, includes `source` field
- `fetchWithRetry` (line 535): 3 retries, exponential backoff, 30s timeout, retries on 429/network errors
- Existing shipping methods: `getAvailableShippingMethods` (line 704), `setShippingMethods` (line 773) — checkout-time only

**Context Pattern (CartContext model):**
- `createContext<T | null>(null)` + custom `useXxxContext()` hook that throws if outside provider
- Provider wraps children in `__root.tsx` component
- State in Provider via `useState` + `useCallback` + `useMemo` for value
- Initial values hydrated from server via root loader (cookies)

**Cookie Pattern:**
- `setCookie/getCookie` from `@tanstack/react-start/server`
- HttpOnly cookies, 30-day maxAge, path "/"
- Root loader reads cookie → passes as `initialXxx` prop to Provider

**Server Functions:**
- All via `createServerFn({ method: "GET"|"POST" })` — no express middleware layer
- Route loaders call server functions for SSR data
- `queryClient` passed via router context for SSR prefetching

**CSS Architecture:**
- BEM naming: `.block__element--modifier`
- Design tokens in `tokens.css`: `--color-*`, `--space-*`, `--font-*`, `--radius-*`
- Existing badge: `.product-card__badge` (absolute positioned, midnight bg, ivory text, uppercase 12px)
- Component CSS imported first in `.tsx` files

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `packages/shared/src/adapters/violetAdapter.ts` | Violet API adapter — getProducts (L144), getProduct (L349), transformOffer (L378), getProductsFromMerchants (L254), shipping methods (L704) |
| `packages/shared/src/types/product.types.ts` | Product (L122), SKU (L91), SkuDimensions (L85) — `source` field at L136 |
| `packages/shared/src/types/cart.types.ts` | Bag (L23) with `shippingTotal` (L33), Cart (L46), ShippingMethod (L169), ShippingAddressInput (L216) |
| `packages/shared/src/schemas/product.schema.ts` | violetOfferSchema (L162) — `source` validated at L182 |
| `packages/shared/src/schemas/cart.schema.ts` | violetShippingMethodSchema (L107) — `min_days`/`max_days` optional (L146-147) |
| `packages/shared/src/utils/constants.ts` | queryKeys factory, VIOLET_API_BASE |
| `apps/web/src/server/getProducts.ts` | Server function for catalog page (L63), categories fallback |
| `apps/web/src/server/getProduct.ts` | Server function for PDP (L21) |
| `apps/web/src/components/product/BaseProductCard.tsx` | Card UI — badge at L109, info section L118-121 |
| `apps/web/src/components/product/ProductCard.css` | Badge CSS L81-94, card structure |
| `apps/web/src/components/product/ProductDetail.tsx` | PDP layout L211-282, PriceBreakdown at L221-226 |
| `apps/web/src/components/product/PriceBreakdown.tsx` | Shipping row L64-68: "Calculated at checkout" |
| `apps/web/src/features/cart/CartBag.tsx` | Bag rendering, shipping display L54-59 |
| `apps/web/src/styles/components/cart-drawer.css` | Bag shipping CSS L254-268 |
| `apps/web/src/components/Header.tsx` | Actions nav L90-132, ThemeToggle at L131 |
| `apps/web/src/styles/components/header.css` | Header layout, icon button patterns |
| `apps/web/src/contexts/CartContext.tsx` | Reference implementation for Context + Provider + cookie pattern |
| `apps/web/src/routes/__root.tsx` | Root loader (L52-74), provider wrapping |
| `apps/web/src/styles/tokens.css` | Design tokens: colors, spacing, typography, radius |

### Technical Decisions

- **GeoIP primary**: Nginx `geoip_module` with `X-Country-Code` header proxied to Node.js — zero latency, no external dependency
- **GeoIP fallback**: `country.is` API (free, no key, commercial OK) — called server-side when header is missing (local dev, direct access)
- **Cookie strategy**: Country code stored in `user_country` cookie (HttpOnly, 30-day TTL), read in root loader, hydrates `UserLocationContext`
- **Non-Shopify fallback**: Products displayed with "Shipping confirmed at checkout" badge instead of being hidden — detected via `product.source !== "SHOPIFY"`
- **Currency display**: Client-side approximate conversion using a static exchange rate table (updated periodically), not a live API. Purely informational — cart/checkout remain in USD
- **Country selector list**: Populated server-side from aggregated shipping zones across all Shopify offers. Popular countries (FR, US, UK, DE, CA) pinned to top. If IP detection fails, show "Select your country" prompt
- **Delivery estimates**: Violet `min_days`/`max_days` are often undefined — use carrier-based fallback table (e.g., Standard US→FR: 7-14 days) when Violet data is absent
- **Shipping zone data**: Added via `?include=shipping` query param on Violet catalog endpoints. Response includes shipping zones per offer (Shopify only)
- **Product type extension**: New `ShippingInfo` type on Product with `shippingZones`, `deliveryEstimate`, `shipsToUserCountry` fields — computed server-side during transformation
- **Query keys**: Add `location` namespace to `queryKeys` in constants.ts for country/shipping cache

## Implementation Plan

### Tasks

#### Phase 1 — Foundation (Data Layer + GeoIP)

- [ ] Task 1: Create shipping types
  - File: `packages/shared/src/types/shipping.types.ts` (NEW)
  - Action: Define `ShippingZone`, `DeliveryEstimate`, `ShippingInfo`, and `CountryOption` interfaces
  - Details:
    - `ShippingZone`: `{ countryCode: string; countryName: string }`
    - `DeliveryEstimate`: `{ minDays: number; maxDays: number; label: string }` (e.g., "5-8 business days")
    - `ShippingInfo`: `{ shipsToUserCountry: boolean; shippingZones: ShippingZone[]; deliveryEstimate: DeliveryEstimate | null; source: "SHOPIFY" | "OTHER" }`
    - `CountryOption`: `{ code: string; name: string; flag: string; productCount: number }`
  - Export from `packages/shared/src/types/index.ts`

- [ ] Task 2: Add shipping fields to Product type
  - File: `packages/shared/src/types/product.types.ts`
  - Action: Add `shippingInfo: ShippingInfo | null` field to `Product` interface (after line 158)
  - Notes: `null` means shipping data not yet resolved (no country context). Import `ShippingInfo` from `shipping.types.ts`

- [ ] Task 3: Extend Violet offer schema for shipping data
  - File: `packages/shared/src/schemas/product.schema.ts`
  - Action: Add `shipping` field to `violetOfferSchema` as optional object containing `shipping_zones` array. Each zone has `country_code`, `country_name`. Use `.optional().default(null)` since `?include=shipping` may not always be used
  - Notes: Violet returns shipping data nested under `shipping` key when `?include=shipping` is passed

- [ ] Task 4: Create delivery estimate fallback table
  - File: `packages/shared/src/utils/currency.ts` (NEW)
  - Action: Create two exports:
    1. `EXCHANGE_RATES`: static `Record<string, number>` mapping currency codes to USD multiplier (EUR: 0.92, GBP: 0.79, CAD: 1.36, etc.). Include comment noting these are approximate and should be updated periodically
    2. `DELIVERY_ESTIMATE_FALLBACK`: `Record<string, DeliveryEstimate>` mapping region pairs to default estimates. Keys like `"US-US"`, `"US-EU"`, `"US-INTL"`. Values like `{ minDays: 3, maxDays: 7, label: "3-7 business days" }`
    3. `convertPrice(cents: number, fromCurrency: string, toCurrency: string): number` — returns converted cents
    4. `formatLocalPrice(cents: number, currency: string): string` — formats with locale symbol
    5. `getDeliveryEstimate(fromCountry: string, toCountry: string, violetMinDays?: number, violetMaxDays?: number): DeliveryEstimate` — uses Violet data if available, falls back to region table

- [ ] Task 5: Create GeoIP server function
  - File: `apps/web/src/server/geoip.ts` (NEW)
  - Action: Create two server functions:
    1. `detectCountryFn`: `createServerFn({ method: "GET" })` — reads `X-Country-Code` header (Nginx), falls back to `country.is` API fetch, sets `user_country` cookie (HttpOnly, 30 days), returns `{ countryCode: string; countryName: string }`
    2. `setCountryFn`: `createServerFn({ method: "POST" })` — accepts `{ countryCode: string }`, updates `user_country` cookie, returns updated country info
    3. `getCountryCookieFn`: `createServerFn({ method: "GET" })` — reads `user_country` cookie, returns `{ countryCode: string | null }`
  - Notes: Use a `COUNTRY_NAMES` lookup map (ISO 3166-1 alpha-2 → English name) for the ~30 most common shipping destinations. For `country.is` fallback, use `fetch("https://api.country.is")` server-side with 2s timeout + try/catch (return `null` on failure, don't block SSR)

- [ ] Task 6: Create UserLocationContext
  - File: `apps/web/src/contexts/UserLocationContext.tsx` (NEW)
  - Action: Follow CartContext pattern exactly:
    1. `UserLocationContextValue` interface: `{ countryCode: string | null; countryName: string | null; setCountry: (code: string) => void; isDetecting: boolean }`
    2. `UserLocationContext = createContext<UserLocationContextValue | null>(null)`
    3. `useUserLocation()` hook: throws if outside provider
    4. `UserLocationProvider` component: accepts `initialCountryCode` prop (from root loader cookie), manages state, calls `setCountryFn` on country change to persist cookie
  - Notes: No TanStack Query needed here — country is session-level state, not server data

- [ ] Task 7: Wire UserLocationContext into root layout
  - File: `apps/web/src/routes/__root.tsx`
  - Action:
    1. In root loader: call `getCountryCookieFn()` alongside existing `getCartCookieFn()`, return `initialCountryCode`
    2. In root component: wrap children with `<UserLocationProvider initialCountryCode={loaderData.initialCountryCode}>` (nest inside existing `CartProvider`)
  - Notes: If no cookie exists, Provider starts with `countryCode: null` and triggers `detectCountryFn` on mount (client-side effect)

- [ ] Task 8: Update Violet adapter — add shipping data to product fetching
  - File: `packages/shared/src/adapters/violetAdapter.ts`
  - Action:
    1. In `getProducts` (line 144): append `?include=shipping` to the search URL query params
    2. In `getProduct` (line 349): append `?include=shipping` to the single-offer URL
    3. In `getProductsFromMerchants` (line 276): append `?include=shipping` to per-merchant offer URLs
    4. In `transformOffer` (line 378): parse the `shipping` field from raw offer. Extract shipping zones, map to `ShippingZone[]`. Set `shippingInfo` on returned Product:
       - If `raw.source === "SHOPIFY"` and shipping zones exist: populate `shippingZones`, compute `shipsToUserCountry` based on passed `countryCode` param, compute `deliveryEstimate` from Violet `min_days`/`max_days` or fallback table
       - If `raw.source !== "SHOPIFY"` or no shipping data: set `shippingInfo.source = "OTHER"`, `shipsToUserCountry = true` (don't filter), `deliveryEstimate = null`
    5. Add `countryCode?: string` parameter to `getProducts`, `getProduct`, `getProductsFromMerchants`, and `transformOffer`
    6. Add new method `getAvailableCountries(): Promise<ApiResponse<CountryOption[]>>` — fetches all offers with `?include=shipping`, aggregates unique countries from all shipping zones, returns sorted list with product counts
  - Notes: `transformOffer` signature changes — add `countryCode` as optional 2nd parameter. When `countryCode` is provided, compute `shipsToUserCountry`. The filtering (removing non-shipping products) happens in the server functions (Task 9), NOT in the adapter

- [ ] Task 9: Update server functions — pass country, filter results
  - File: `apps/web/src/server/getProducts.ts`
  - Action:
    1. Import `getCountryCookieFn` from `./geoip`
    2. In `getProductsFn`: read country from cookie via `getCountryCookieFn()`, pass `countryCode` to adapter's `getProducts`
    3. After receiving results: filter out products where `shippingInfo?.shipsToUserCountry === false` (Shopify products that don't ship to user's country). Keep products where `shippingInfo` is null or `source === "OTHER"`
    4. Adjust pagination metadata after filtering (total count, hasNext)
  - File: `apps/web/src/server/getProduct.ts`
  - Action: Read country cookie, pass `countryCode` to adapter's `getProduct`. Do NOT filter single product — show it with shipping info (user navigated directly)

- [ ] Task 10: Add query keys for location
  - File: `packages/shared/src/utils/constants.ts`
  - Action: Add to `queryKeys`:
    ```
    location: {
      countries: () => ["location", "countries"] as const,
    }
    ```
  - Notes: Products query keys already include params — country will be part of the ProductQuery params naturally

#### Phase 2 — UI Components

- [ ] Task 11: Add delivery badge to product card
  - File: `apps/web/src/components/product/ProductCard.tsx`
  - Action: Pass `shippingInfo` from product to `BaseProductCard` props
  - File: `apps/web/src/components/product/BaseProductCard.tsx`
  - Action:
    1. Add `shippingInfo: ShippingInfo | null` to props interface
    2. After the existing `.product-card__badge` (line 109), add delivery badge:
       - If `shippingInfo?.deliveryEstimate`: show `.product-card__badge--delivery` with estimate label (e.g., "5-8 days")
       - If `shippingInfo?.source === "OTHER"`: show `.product-card__badge--shipping-tbd` with "Shipping TBD"
       - If no shippingInfo: show nothing
    3. Badge sits in `.product-card__info` section (after price, line 121) — NOT overlaid on image like "Sold Out"
  - File: `apps/web/src/components/product/ProductCard.css`
  - Action: Add BEM modifiers:
    ```css
    .product-card__delivery {
      font-size: var(--text-xs);
      color: var(--color-steel);
      margin-top: var(--space-1);
    }
    .product-card__delivery--available {
      color: var(--color-success);
    }
    .product-card__delivery--tbd {
      color: var(--color-silver);
      font-style: italic;
    }
    ```

- [ ] Task 12: Add shipping section to PDP
  - File: `apps/web/src/components/product/ProductDetail.tsx`
  - Action: After `PriceBreakdown` (line 226), add a new shipping info section:
    1. If `shippingInfo?.source === "SHOPIFY"` and `shipsToUserCountry`:
       ```
       <div className="product-detail__shipping">
         <h3>Shipping to {countryFlag} {countryName}</h3>
         <p>{deliveryEstimate.label}</p>
         <button onClick={openCountrySelector}>Change country</button>
       </div>
       ```
    2. If `shippingInfo?.source === "SHOPIFY"` and NOT `shipsToUserCountry`:
       ```
       <div className="product-detail__shipping product-detail__shipping--unavailable">
         <p>This product doesn't ship to {countryName}</p>
         <button>Change country</button>
       </div>
       ```
    3. If `shippingInfo?.source === "OTHER"`:
       ```
       <div className="product-detail__shipping product-detail__shipping--tbd">
         <p>Shipping availability confirmed at checkout</p>
       </div>
       ```
  - Notes: Import `useUserLocation()` to get current country. Add CSS to existing `apps/web/src/styles/pages/product-detail.css` or component co-located CSS

- [ ] Task 13: Update PriceBreakdown with currency display
  - File: `apps/web/src/components/product/PriceBreakdown.tsx`
  - Action:
    1. Import `useUserLocation` and `convertPrice`, `formatLocalPrice` from currency utils
    2. If user's country implies a non-USD currency (e.g., FR → EUR): show approximate local price below USD price as muted text: "≈ €174.00" with tooltip/note "Approximate. Charged in USD"
    3. Update shipping row: if `shippingInfo?.deliveryEstimate` exists, replace "Calculated at checkout" with estimate label
  - Notes: Currency mapping: country code → currency code (simple lookup table, e.g., FR→EUR, GB→GBP, CA→CAD, DE→EUR)

- [ ] Task 14: Create CountrySelector component
  - File: `apps/web/src/components/CountrySelector.tsx` (NEW)
  - Action: Named function component with:
    1. Props: `{ isOpen: boolean; onClose: () => void; onSelect: (code: string) => void }`
    2. Fetches country list via `useSuspenseQuery` with `queryKeys.location.countries()`
    3. Renders dropdown/popover with:
       - Search input to filter countries
       - Popular countries pinned to top (FR, US, UK, DE, CA) with separator
       - Each option: flag emoji + country name + product count badge
       - Current country highlighted
    4. On select: calls `onSelect(code)` → parent calls `setCountry()` from `useUserLocation()`
  - File: `apps/web/src/styles/components/country-selector.css` (NEW)
  - Action: BEM styles for `.country-selector`, `.country-selector__search`, `.country-selector__list`, `.country-selector__option`, `.country-selector__option--active`, `.country-selector__option--popular`
  - Notes: Use design tokens consistently. Popover positioned relative to trigger button. Close on outside click + Escape key

- [ ] Task 15: Add country selector to Header
  - File: `apps/web/src/components/Header.tsx`
  - Action:
    1. Import `useUserLocation`, `CountrySelector`
    2. In `.site-header__actions` nav (after ThemeToggle, line 131): add country button
       ```
       <button className="site-header__country" onClick={toggleCountrySelector}>
         {countryFlag} {countryCode}
       </button>
       ```
    3. Render `<CountrySelector>` as popover when open
    4. If no country detected yet: show globe icon with "Select country"
  - File: `apps/web/src/styles/components/header.css`
  - Action: Add `.site-header__country` styles following existing icon button pattern (24px icons, padding, hover transition)

- [ ] Task 16: Create empty state for no-products country
  - File: `apps/web/src/server/getProducts.ts`
  - Action: When filtered results are empty AND country is set, return a special `emptyReason: "no-shipping"` flag in the response
  - File: Catalog page route (where product grid renders)
  - Action: When `emptyReason === "no-shipping"`, render empty state:
    ```
    No products available for shipping to {countryFlag} {countryName}
    Try browsing from: [FR] [US] [UK] (buttons that call setCountry)
    ```
  - Notes: Suggested countries are the top 3-5 by product count from the countries list

#### Phase 3 — Checkout Integration

- [ ] Task 17: Add delivery info to CartBag
  - File: `apps/web/src/features/cart/CartBag.tsx`
  - Action:
    1. Import `useUserLocation`
    2. After shipping total display (line 59): if bag items have shipping info with delivery estimates, show:
       ```
       <div className="cart-drawer__bag-delivery">
         📦 Est. delivery: {estimatedDateRange}
       </div>
       ```
    3. Compute estimated date range: today + minDays to today + maxDays, formatted as "Apr 2-5"
    4. If no estimate available: show nothing (don't show "unknown")
  - File: `apps/web/src/styles/components/cart-drawer.css`
  - Action: Add `.cart-drawer__bag-delivery` styles:
    ```css
    .cart-drawer__bag-delivery {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) 0;
      font-size: 0.8125rem;
      color: var(--color-success);
    }
    ```

- [ ] Task 18: Pre-select shipping method from earlier display
  - File: `apps/web/src/routes/checkout/index.tsx`
  - Action:
    1. When user reaches checkout shipping step and `getAvailableShippingMethods` returns: if the user already saw a delivery estimate on the PDP/card, auto-select the matching shipping method (match by carrier/label/price)
    2. If no match found or user never saw estimates: default behavior (user selects manually)
  - Notes: This is a UX enhancement, not a hard requirement. The matching is best-effort based on the carrier/label fields

- [ ] Task 19: Inform currency in cart totals
  - File: `apps/web/src/features/cart/CartBag.tsx` (same as Task 17)
  - Action: Below each USD total, show approximate local currency if user's country is non-USD:
    ```
    Subtotal  $189.00
              ≈ €174.00
    ```
  - Notes: Use `convertPrice` and `formatLocalPrice` from currency utils. Muted text style, not prominent

### Acceptance Criteria

#### Phase 1 — Foundation

- [ ] AC 1: Given a first-time visitor from France, when they load the homepage, then the server detects their country via `X-Country-Code` header (or `country.is` fallback), sets a `user_country=FR` cookie, and the catalog only shows products with Shopify shipping zones that include France
- [ ] AC 2: Given a visitor with `user_country=FR` cookie, when they refresh the page, then no GeoIP lookup occurs (cookie is read) and the same filtered catalog is displayed
- [ ] AC 3: Given a product from a Shopify merchant with shipping zones covering FR and US only, when a visitor from DE loads the catalog, then this product is NOT shown in the catalog grid
- [ ] AC 4: Given a product from a non-Shopify merchant (source !== "SHOPIFY"), when any visitor loads the catalog, then the product IS shown regardless of country (not filtered out)
- [ ] AC 5: Given the `?include=shipping` param is added to Violet API calls, when the adapter transforms an offer, then `Product.shippingInfo` is populated with zones and delivery estimate (or null for non-Shopify)

#### Phase 2 — UX

- [ ] AC 6: Given a Shopify product that ships to the user's country, when the product card renders, then a delivery estimate badge appears below the price (e.g., "5-8 days") in `--color-success`
- [ ] AC 7: Given a non-Shopify product, when the product card renders, then a "Shipping TBD" badge appears in italic muted text
- [ ] AC 8: Given a user on a product detail page for a Shopify product, when they view the shipping section, then they see "Shipping to 🇫🇷 France" with delivery estimate and a "Change country" button
- [ ] AC 9: Given a user on a PDP for a product that does NOT ship to their country, when they view the page, then an "unavailable" shipping message appears with a prompt to change country
- [ ] AC 10: Given a user clicks the country selector in the header, when the popover opens, then it shows a searchable list of countries with flags, names, and product counts, with popular countries pinned to top
- [ ] AC 11: Given a user selects a new country (e.g., changes FR to US), when the selection is confirmed, then the cookie updates, the catalog refetches with the new country filter, and the product grid updates without full page reload
- [ ] AC 12: Given a user's country has zero deliverable Shopify products and no non-Shopify products, when the catalog renders, then an empty state shows "No products available for shipping to {country}" with suggested alternative countries
- [ ] AC 13: Given a French user viewing a $189.00 USD product, when PriceBreakdown renders, then "≈ €174.00" appears below the USD price with a note "Approximate. Charged in USD"

#### Phase 3 — Checkout Integration

- [ ] AC 14: Given a cart with bags from Shopify merchants, when the cart drawer renders, then each bag shows an estimated delivery date range (e.g., "Est. delivery: Apr 2-5") below the shipping total
- [ ] AC 15: Given a bag with no delivery estimate data, when the cart drawer renders, then no delivery date is shown (no "unknown" or placeholder)
- [ ] AC 16: Given a user in France viewing cart totals in USD, when the cart drawer renders, then approximate EUR equivalents appear as muted text below each USD amount
- [ ] AC 17: Given a user who saw "Standard 5-8 days" on the PDP, when they reach the checkout shipping step, then that shipping method is pre-selected if available in the carrier's options

#### Edge Cases

- [ ] AC 18: Given the `country.is` API is down and no Nginx header is present (e.g., local dev), when a first-time visitor loads the page, then no country is detected, `countryCode` is null, the catalog shows ALL products unfiltered, and the header shows "Select country" instead of a flag
- [ ] AC 19: Given a product's Violet shipping data has no `min_days`/`max_days`, when the delivery estimate is computed, then the fallback table is used based on origin-destination region pair
- [ ] AC 20: Given the Violet API returns offers without the `shipping` field (flag not enabled), when `transformOffer` runs, then `shippingInfo` is null and no filtering occurs (graceful degradation)

## Additional Context

### Dependencies

- **Violet `sync_product_shipping` flag**: Must be enabled per merchant in Violet dashboard (ops task). Without it, `?include=shipping` returns no shipping data and the feature degrades gracefully (no filtering, no estimates)
- **Hostinger VPS + Nginx**: `geoip_module` loaded, MaxMind GeoLite2-Country database downloaded, `X-Country-Code` header configured in Nginx proxy config
- **MaxMind GeoLite2**: Free database, requires registration for download. Updated weekly via `geoipupdate` cron job
- **No new npm dependencies**: `country.is` is a fetch call, not a package. Currency conversion is a static table. Country names/flags are hardcoded constants

### Testing Strategy

**Unit Tests:**
- `packages/shared/src/utils/__tests__/currency.test.ts`: Test `convertPrice`, `formatLocalPrice`, `getDeliveryEstimate` — happy path + edge cases (unknown currency, missing Violet data, same-country shipping)
- `packages/shared/src/adapters/__tests__/violetAdapter.test.ts`: Extend existing tests — verify `transformOffer` populates `shippingInfo` from Violet shipping data, handles missing shipping data gracefully, filters by country correctly
- `apps/web/src/contexts/__tests__/UserLocationContext.test.tsx`: Test Provider renders, hook throws outside provider, `setCountry` updates state
- `apps/web/src/components/product/__tests__/BaseProductCard.test.tsx`: Extend — verify delivery badge renders for Shopify products, "Shipping TBD" for non-Shopify, nothing when null
- `apps/web/src/components/__tests__/CountrySelector.test.tsx`: Test renders country list, search filters, selection calls callback, popular countries pinned

**Integration Tests (Manual):**
- Verify Violet sandbox returns shipping data with `?include=shipping` flag
- Test full flow: detect country → filter catalog → change country → see different products
- Test cookie persistence across page reloads
- Verify non-Shopify products always appear regardless of country
- Test empty state when selecting a country with no deliverable products
- Verify cart drawer shows delivery estimates when available
- Test checkout pre-selection of shipping method

### Notes

- **High-risk: Violet `?include=shipping` response shape** — Violet docs describe shipping zones but the exact response structure under the `shipping` key should be verified against the sandbox before implementation. Fetch a sample offer with `?include=shipping` to confirm the JSON shape
- **High-risk: Pagination after filtering** — Server-side filtering reduces result count, which may cause pages to be smaller than requested `size`. Consider over-fetching (request `size * 1.5`) and trimming, or document that page sizes may be inconsistent
- **Known limitation: Delivery estimates are approximate** — Fallback table provides region-based ranges, not carrier-specific. Shopify `min_days`/`max_days` may also be inaccurate
- **Known limitation: Exchange rates are static** — Rates in the table will drift from market rates. Add a comment with last-updated date and consider a monthly update cadence
- **Future consideration: Country selector could use Supabase edge function** — If the aggregated country list becomes expensive to compute (many merchants), cache it in Supabase with a 1-hour TTL
- **Future consideration: Mobile app** — `UserLocationContext` lives in `apps/web/` but the types and utils are in `packages/shared/`, ready for Expo consumption when mobile geo-filtering is implemented
- Pre-planning analysis: `_bmad-output/planning-artifacts/geo-shipping-analysis.md`
