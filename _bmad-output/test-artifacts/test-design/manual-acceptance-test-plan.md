# Manual Acceptance Test Plan -- Maison Emile E-Commerce Platform

**Version:** 1.1
**Date:** 2026-03-28
**Last Test Execution:** 2026-03-28 (Epic 4 Story 4-1 — Web)
**Platforms:** Web (Browser), Mobile (Android Studio Emulator)
**Total Stories:** 48 across 8 Epics
**Total Test Cases:** 230+

---

## Table of Contents

1. [Pre-Test Setup](#pre-test-setup)
2. [Epic 1: Project Foundation](#epic-1-project-foundation-p3)
3. [Epic 2: Authentication](#epic-2-authentication-p0)
4. [Epic 3: Product Discovery](#epic-3-product-discovery-p1)
5. [Epic 4: Cart & Checkout](#epic-4-cart--checkout-p0)
6. [Epic 5: Orders](#epic-5-orders-p1)
7. [Epic 6: Personalization](#epic-6-personalization-p2)
8. [Epic 7: Content & SEO](#epic-7-content--seo-p2)
9. [Epic 8: Admin & Operations](#epic-8-admin--operations-p2-p3)
10. [Post-Test Checklist](#post-test-checklist)
11. [Recommended Execution Order](#recommended-execution-order)

---

## Pre-Test Setup

Complete all items before starting test execution.

- [ ] `supabase start` -- local Supabase running (Studio at localhost:54323)
- [ ] `supabase db reset` -- database seeded with latest migrations
- [ ] `.env.local` at project root configured with all required keys:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - `VIOLET_APP_ID`, `VIOLET_APP_SECRET`, `VIOLET_USERNAME`, `VIOLET_PASSWORD`
  - `VIOLET_API_BASE` (sandbox: `https://sandbox-api.violet.io/v1`)
  - `VITE_STRIPE_PUBLISHABLE_KEY`
  - `OPENAI_API_KEY`
- [ ] `apps/web/.env.local` configured with server-side keys (see `apps/web/.env.example`):
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, **`SUPABASE_SERVICE_ROLE_KEY`** (required for cart)
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - `VIOLET_*` credentials
- [ ] `bun run dev` -- web server running on `http://localhost:3000`
- [ ] `supabase functions serve --env-file supabase/.env` -- Edge Functions running (required for recommendations, search, tracking)
- [ ] `bun run dev:mobile` -- Expo running, connected to Android Studio emulator
- [ ] Test user account created (`test@example.com` / secure password)
- [ ] Admin user configured (run `SELECT set_admin_role('<user-id>')` in Supabase SQL Editor)
- [ ] Stripe test mode active with test card numbers ready:
  - Standard: `4242 4242 4242 4242`
  - 3D Secure: `4000 0025 0000 3155`
  - Declined: `4000 0000 0000 0002`
- [ ] Products available in Violet sandbox environment
- [ ] Browser DevTools open (Console + Network + Application tabs)
- [ ] Android Studio emulator running API 34+

---

## Epic 1: Project Foundation (P3)

Infrastructure and tooling verification. All stories are backend-only -- test by running commands in terminal.

### Story 1-1: Monorepo Initialization & Workspace Configuration

**Priority:** P3 | **Platform:** Backend-only

**Preconditions:** Repository cloned, Bun installed.

- [ ] `bun install` completes without errors
- [ ] `bun run dev` starts web app on port 3000 (Vite + TanStack Start)
- [ ] `bun run dev:mobile` starts Expo development server
- [ ] Workspace resolution works: `packages/shared`, `packages/ui`, `packages/config` importable from apps
- [ ] `bun run typecheck` passes with 0 errors

### Story 1-2: Shared Packages Setup (Types, Utils, Config)

**Priority:** P3 | **Platform:** Backend-only

**Preconditions:** `bun install` completed.

- [ ] `packages/shared` exports types, adapters, schemas, clients (check `package.json` exports field)
- [ ] `packages/ui` exports design tokens
- [ ] `packages/config` exports shared configuration
- [ ] `bun --cwd=packages/shared run test` passes (if tests exist)
- [ ] TypeScript path aliases resolve: `@ecommerce/shared` imports work in `apps/web`

### Story 1-3: Design Token System & Cross-Platform Styling Foundation

**Priority:** P3 | **Platform:** Both

**Preconditions:** Web and mobile apps running.

- [ ] Web: CSS custom properties load (inspect `--color-primary`, `--font-family-base` in DevTools)
- [ ] Web: Dark theme toggle works (check `[data-theme="dark"]` tokens)
- [ ] Web: Fonts load correctly (Inter or configured font family)
- [ ] Web: BEM class naming visible in DOM (`.block__element--modifier` pattern)
- [ ] Mobile: Design tokens applied (colors, spacing match web)

### Story 1-4: Supabase Local Development Setup

**Priority:** P3 | **Platform:** Backend-only

**Preconditions:** Docker running.

- [ ] `supabase start` completes successfully
- [ ] Supabase Studio accessible at `http://localhost:54323`
- [ ] All migrations applied (check Tables in Studio)
- [ ] `user_profiles` table exists with RLS enabled
- [ ] `product_embeddings` table exists with pgvector extension
- [ ] Edge Functions deployable: `supabase functions serve`

### Story 1-5: CI/CD Pipeline Foundation

**Priority:** P3 | **Platform:** Backend-only

- [ ] `.github/workflows/` directory contains workflow files
- [ ] `bun run lint` passes with `--max-warnings 0`
- [ ] `bun run format` reports no formatting issues
- [ ] `bun run fix-all` runs Prettier + ESLint + TypeScript check without errors
- [ ] `bun --cwd=apps/web run test` all Vitest tests pass

---

## Epic 2: Authentication (P0)

Authentication is critical path. Test thoroughly on both platforms.

### Story 2-1: Anonymous Session & Supabase Auth Setup

**Priority:** P0 | **Platform:** Both

**Preconditions:** Supabase running, fresh browser profile (no cookies).

- [ ] **Web:** Open `http://localhost:3000` for the first time in incognito
- [ ] **Web:** Check DevTools > Application > Cookies -- Supabase auth cookie present
- [ ] **Web:** Check DevTools > Console -- no auth errors
- [ ] **Web:** Verify anonymous session has `auth.uid()` (check Network tab for Supabase calls)
- [ ] **Web:** Reload page -- session persists (same `auth.uid()`)
- [ ] **Web:** No login UI shown; platform fully browsable without account
- [ ] **Mobile:** Open app for the first time -- no login screen shown
- [ ] **Mobile:** App creates anonymous session automatically
- [ ] **Mobile:** Kill app and reopen -- session persists
- [ ] **Both:** `user_profiles` row created in Supabase for anonymous user (check Studio)

### Story 2-2: User Registration & Login

**Priority:** P0 | **Platform:** Both

**Preconditions:** Anonymous session active, Supabase email provider configured.

- [ ] **Web:** Navigate to `/auth/signup`
- [ ] **Web:** Submit empty form -- inline validation errors appear (required fields)
- [ ] **Web:** Enter invalid email (e.g. "notanemail") -- email format error shown
- [ ] **Web:** Enter short password (< 6 chars) -- password length error shown
- [ ] **Web:** Register with valid email + password -- account created successfully
- [ ] **Web:** After signup, anonymous session converts to full account (same cart, same data)
- [ ] **Web:** Log out (if logout available) then navigate to `/auth/login`
- [ ] **Web:** Login with valid credentials -- redirected to previous page (or home)
- [ ] **Web:** Login with wrong password -- error message shown (no details about which field)
- [ ] **Mobile:** Auth signup screen renders with native styling
- [ ] **Mobile:** Can register with email + password
- [ ] **Mobile:** Can login with registered credentials
- [ ] **Mobile:** Form validation works (empty fields, invalid email)
- [ ] **Both:** Check Supabase Studio -- `user_profiles` row exists for new user
- [ ] **Both:** Check Supabase Studio -- `auth.users` row has correct email

### Story 2-3: Violet API Token Management

**Priority:** P0 | **Platform:** Backend-only

**Preconditions:** Violet API credentials configured in `.env.local`.

- [ ] Server authenticates with Violet API on startup (check server logs for token fetch)
- [ ] API calls to Violet succeed (product fetch returns data, not 401)
- [ ] Token stored securely (not exposed in client bundle or network responses)
- [ ] No user-facing errors from token management issues

### Story 2-4: Biometric Authentication

**Priority:** P1 | **Platform:** Mobile only

**Preconditions:** Android emulator with fingerprint configured, user logged in.

- [ ] Biometric option visible in profile/settings screen
- [ ] Can enable biometric authentication toggle
- [ ] Kill app and reopen -- biometric prompt appears
- [ ] Successful biometric auth logs user in
- [ ] Cancel biometric -- falls back to password login
- [ ] `biometric_enabled` flag saved in `user_profiles` (check Supabase Studio)

### Story 2-5: Layout Shell & Navigation

**Priority:** P1 | **Platform:** Both

**Preconditions:** App running on both platforms.

**Web Layout:**
- [ ] Header renders: logo, search bar, cart icon, account icon
- [ ] Footer renders: navigation links, affiliate disclosure, legal links
- [ ] Responsive at 640px breakpoint (mobile layout)
- [ ] Responsive at 768px breakpoint (tablet layout)
- [ ] Responsive at 1024px breakpoint (desktop layout)
- [ ] Responsive at 1280px breakpoint (wide desktop)
- [ ] Responsive at 1440px breakpoint (ultra-wide)
- [ ] Keyboard navigation: Tab through all interactive elements in header
- [ ] Keyboard navigation: Focus indicators visible on all interactive elements
- [ ] Skip-to-content link visible on Tab (accessibility)

**Mobile Layout:**
- [ ] Tab bar shows: Home, Search, Cart, Profile tabs
- [ ] Tab icons use design token colors (active vs inactive)
- [ ] Tab navigation switches between screens correctly
- [ ] Back navigation (hardware button / gesture) works

**Both:**
- [ ] Skeleton loading states shown (no raw spinners)
- [ ] No layout shift on content load (CLS minimal)

---

## Epic 3: Product Discovery (P1)

### Story 3-1: Violet Catalog Adapter & Product Types

**Priority:** P1 | **Platform:** Backend-only

**Preconditions:** Violet API credentials valid, products exist in sandbox.

- [ ] Products load from Violet API (check Network tab or server logs)
- [ ] Response data uses camelCase (not Violet's snake_case)
- [ ] API errors return structured response: `{ data: null, error: { code, message } }`
- [ ] Product types include: id, name, description, price, images, variants, merchant info
- [ ] No sensitive Violet API data leaked to client (no API keys in responses)

### Story 3-2: Product Listing Page with Category Browsing

**Priority:** P1 | **Platform:** Both

**Preconditions:** Products available in Violet sandbox.

- [ ] **Web:** Navigate to `/products` -- product grid renders (SSR: check View Source for HTML content)
- [ ] **Web:** Product cards display: image, name, price, merchant name
- [ ] **Web:** "Load more" button appears at bottom -- clicking loads next page
- [ ] **Web:** Category chips visible above product grid
- [ ] **Web:** Click category chip -- products filter to that category
- [ ] **Web:** Product count shows "Showing X of Y products"
- [ ] **Web:** Skeleton loading visible on initial page load
- [ ] **Mobile:** Home screen shows product list (FlatList)
- [ ] **Mobile:** Product cards display correctly with native styling
- [ ] **Mobile:** Scroll to bottom loads more products (infinite scroll or load more)
- [ ] **Both:** Clicking/tapping a product card navigates to product detail

### Story 3-3: Product Detail Page

**Priority:** P1 | **Platform:** Both

**Preconditions:** At least one product with variants and multiple images available.

- [ ] **Web:** Navigate to `/products/[id]` -- page renders with full product info (SSR: check View Source)
- [ ] **Web:** Image gallery shows main image + thumbnails
- [ ] **Web:** Click thumbnail -- main image updates
- [x] **Web:** Variant selector (size/color) visible if product has multiple SKUs *(Note: Violet demo products have variants defined but only 1 SKU — variant selectors correctly hidden, SKU auto-selected)*
- [x] **Web:** Selecting variant updates displayed price *(N/A for single-SKU products — price shown directly)*
- [x] **Web:** Price breakdown visible (base price, any applicable fees)
- [x] **Web:** View Source -- JSON-LD `Product` structured data present
- [x] **Web:** Affiliate disclosure visible near "Add to Bag" CTA
- [ ] **Mobile:** Product detail opens via stack navigation (push animation)
- [ ] **Mobile:** Image gallery is swipeable (horizontal scroll)
- [ ] **Mobile:** Variant selector works with native picker
- [x] **Both:** "Add to Bag" button visible and enabled *(Fixed 2026-03-28: P0 bug — selectedSku was null for products with variants but 1 SKU)*
- [ ] **Both:** Unavailable/out-of-stock product shows appropriate disabled state
- [ ] **Both:** Back navigation returns to product list with scroll position preserved

### Story 3-4: Product Filtering & Sorting

**Priority:** P2 | **Platform:** Both

**Preconditions:** Multiple products with varying prices available.

- [ ] Price filter chips visible: Under $50, Under $100, Under $200 (or similar ranges)
- [ ] Click price filter -- product list updates to show only matching products
- [ ] Sort by price ascending works (cheapest first)
- [ ] Sort by price descending works (most expensive first)
- [ ] Multiple filters can be combined (price range + category)
- [ ] **Web:** Filter selections reflected in URL query params (`?minPrice=0&maxPrice=50&sort=price_asc`)
- [ ] **Web:** Copy URL with filters and open in new tab -- same filters applied
- [ ] Zero results: "No products match your filters" message with "Clear filters" button
- [ ] Clear filters button resets all filters and shows full product list
- [ ] Product count updates dynamically when filters change

### Story 3-5: AI Conversational Search (Edge Function & Embeddings)

**Priority:** P1 | **Platform:** Backend-only

**Preconditions:** OpenAI API key configured, product embeddings generated in `product_embeddings` table.

- [ ] `search-products` Edge Function responds to POST request with query
- [ ] Natural language query returns relevant products (e.g., "red summer dress")
- [ ] Results include match explanation text
- [ ] Response time < 2 seconds
- [ ] Empty query returns error response (not crash)
- [ ] Very long query (> 500 chars) handled gracefully

### Story 3-6: AI Conversational Search UI

**Priority:** P1 | **Platform:** Both

**Preconditions:** `search-products` Edge Function working, embeddings populated.

- [ ] **Web:** Search bar visible in header with placeholder text
- [ ] **Web:** Type 2+ characters and press Enter -- navigates to `/search?q=...`
- [ ] **Web:** Search results display as product grid
- [ ] **Web:** Each result shows "why this matches" explanation text
- [ ] **Web:** Empty results show suggestions or "No results found" message
- [ ] **Web:** Loading skeleton visible during search
- [ ] **Mobile:** Search tab shows search input field
- [ ] **Mobile:** Typing and submitting query shows results
- [ ] **Mobile:** Results display with match explanations
- [ ] **Both:** Error state shows user-friendly fallback message (not raw error)
- [ ] **Both:** Search with special characters does not crash

### Story 3-7: Product Catalog Sync via Webhooks

**Priority:** P0 | **Platform:** Backend-only

**Preconditions:** `handle-webhook` Edge Function deployed, `webhook_events` table exists.

- [ ] Send test webhook with valid HMAC -- returns 200
- [ ] Send test webhook with invalid HMAC -- returns 401
- [ ] Send same `X-Violet-Event-Id` twice -- second request returns 200 but is not processed (idempotency)
- [ ] `OFFER_UPDATED` event triggers embedding regeneration (check `product_embeddings` table)
- [ ] `OFFER_REMOVED` event marks product as `available = false` in `product_embeddings`
- [ ] `OFFER_DELETED` event marks product as unavailable
- [ ] Webhook payload validated with Zod (malformed payload returns 400)
- [ ] `webhook_events` table records all processed events
- [ ] Webhook handler returns 200 quickly (< 500ms acknowledgment)

### Story 3-8: SEO Foundation

**Priority:** P2 | **Platform:** Web only

**Preconditions:** Web app running, products loaded.

- [ ] Homepage has dynamic `<title>` tag (not default "Vite App")
- [ ] Homepage has `<meta name="description">` tag
- [ ] Product page has product-specific `<title>` (includes product name)
- [ ] Product page has product-specific `<meta name="description">`
- [ ] Product page has JSON-LD `Product` schema (check View Source)
- [ ] Navigate to `/robots.txt` -- file served correctly
- [ ] `robots.txt` blocks auth routes (`/auth/*`)
- [ ] `robots.txt` blocks checkout routes (`/checkout/*`)
- [ ] SSR response time < 1.5s (check Network tab for document load time)

---

## Epic 4: Cart & Checkout (P0)

Revenue-critical path. Test every scenario meticulously.

> **Test Session: 2026-03-28 (Web)**
>
> **Bugs found and fixed during testing:**
>
> | # | Severity | Description | Root Cause | Fix |
> |---|----------|-------------|------------|-----|
> | 1 | **P0** | `selectedSku` always null — "Add to Bag" click silently ignored | Logic gap: products with variants but 1 SKU fell between auto-select (requires 0 variants) and manual select (requires >1 SKU) | `ProductDetail.tsx`: auto-select when `skus.length === 1` |
> | 2 | **P1** | Cart creation fails: "Missing SUPABASE_SERVICE_ROLE_KEY" | `apps/web/.env.local` missing `SUPABASE_SERVICE_ROLE_KEY` — Bun's `--env-file` resolves relative to `--cwd` | Added key to `apps/web/.env.local` + updated `.env.example` |
> | 3 | **P1** | Cart drawer shows Subtotal $0.00 / Total $0.00 | Violet returns 0 for aggregates before checkout steps | `violetAdapter.ts`: compute subtotal from items when Violet returns 0 |
> | 4 | **P2** | Edge Functions return 401 Unauthorized | `verify_jwt=true` (default) blocks unauthenticated/anonymous calls at gateway | `config.toml`: `verify_jwt=false` for `get-recommendations`, `search-products`, `track-event` |
> | 5 | **P2** | Edge Functions BOOT_ERROR (503) | Duplicate `const body` in `violetAuth.ts` (same function scope) | Renamed to `loginData`/`refreshData` |
> | 6 | **P1** | +/- quantity and Remove return 404 "Order Sku could not be found" | Update/remove used catalog `skuId` instead of Violet `OrderSku.id` in API path | Pass `orderSkuId` (cart line item ID) through entire chain |

### Story 4-1: Cart Creation & Item Management

**Priority:** P0 | **Platform:** Both

**Preconditions:** Products available, anonymous or authenticated session active. `supabase functions serve` running. `SUPABASE_SERVICE_ROLE_KEY` in `apps/web/.env.local`.

- [x] **Web:** Click "Add to Cart" on a product -- cart created via Violet API *(Tested: Unicorn Hoodie, product 59398)*
- [x] **Web:** Cart drawer/panel slides in from right side *(Shopping Bag drawer opens correctly)*
- [ ] **Web:** Cart badge in header updates to show item count *(P2 bug: Cart icon is a `<Link to="/">` — no badge, navigates to home instead of opening drawer)*
- [x] **Web:** Add same product again -- quantity increases (not duplicate line item) *(Confirmed: qty went from 1 to 3)*
- [x] **Web:** Click +/- to update quantity -- total updates *(Fixed: was using catalog skuId instead of OrderSku id for Violet API — 5→4→5 confirmed)*
- [x] **Web:** Click remove (X) -- item removed from cart *(Remove button works, item disappears)*
- [x] **Web:** Remove last item -- empty cart state shown *("Your bag is empty" + "Start shopping" displayed)*
- [ ] **Mobile:** Tap "Add to Cart" -- item added
- [ ] **Mobile:** Cart tab badge updates with item count
- [ ] **Mobile:** Can update quantity and remove items
- [x] **Both:** Reload page/restart app -- cart persists *(Cart ID cookie persists across reload + navigation; qty 1 → reload → add → qty 2 confirmed)*
- [x] **Both:** Items grouped by merchant (Bag structure visible) *(STYLESPHERE merchant shown)*
- [ ] **Both:** Add out-of-stock item -- error displayed per bag

### Story 4-2: Cart Summary with Transparent Pricing

**Priority:** P0 | **Platform:** Both

**Preconditions:** Cart has items from at least 2 different merchants.

- [x] Items grouped by merchant Bag with merchant name visible *(STYLESPHERE)*
- [x] Subtotal per Bag is correct (item price x quantity) *($201.00 × 3 = $603.00 — Fixed: was $0.00)*
- [x] Tax shown per Bag (or "Calculated at checkout" if not yet determined) *(Est. Tax: $0.00)*
- [x] Shipping shows "Calculated at checkout" before shipping selection *(Correct)*
- [x] Grand total = sum of all Bag totals (verify arithmetic) *($603.00 — correct)*
- [ ] No fake discounts, countdown timers, or urgency indicators
- [ ] Affiliate disclosure visible in cart summary
- [ ] Empty cart: appropriate empty state with CTA to browse products
- [ ] **Web:** "Proceed to Checkout" button visible and functional

### Story 4-3: Shipping Method Selection

**Priority:** P0 | **Platform:** Both

**Preconditions:** Cart with items, navigated to checkout.

- [ ] Checkout page shows shipping address form
- [ ] Address form fields: street, city, state/province, zip, country
- [ ] Submit address -- shipping methods appear per Bag
- [ ] Each shipping method shows: carrier name, delivery estimate, price
- [ ] Select shipping method -- cart total updates to include shipping cost
- [ ] If only one shipping method available -- auto-selected
- [ ] Shipping fetch failure -- user-friendly error message (not blank)
- [ ] Change address -- shipping methods recalculate

### Story 4-4: One-Step Checkout with Stripe Payment

**Priority:** P0 | **Platform:** Both

**Preconditions:** Cart with items, shipping selected, Stripe test mode active.

- [ ] Guest info section collects: email, first name, last name
- [ ] Optional marketing consent checkbox present (unchecked by default)
- [ ] Submit guest info -- billing address section appears
- [ ] Billing address defaults to "Same as shipping" (checked by default)
- [ ] Uncheck "Same as shipping" -- billing address form appears
- [ ] Stripe PaymentElement renders (card input field visible)
- [ ] Enter test card `4242 4242 4242 4242`, future date, any CVC
- [ ] "Place Order" button shows loading state during processing
- [ ] "Place Order" button disabled while processing (no double-submit)
- [ ] On success -- redirected to confirmation page
- [ ] **Mobile:** Stripe PaymentSheet renders and accepts test card
- [ ] On failure (use declined card `4000 0000 0000 0002`) -- stays on checkout with error
- [ ] Form data preserved after payment failure (email, address not cleared)

### Story 4-5: Payment Confirmation & 3D Secure Handling

**Priority:** P0 | **Platform:** Both

**Preconditions:** Checkout page ready, Stripe test mode.

- [ ] Use 3DS test card `4000 0025 0000 3155` -- 3D Secure challenge modal appears
- [ ] Complete 3D Secure challenge -- order submitted successfully
- [ ] Confirmation page shows: order ID, ordered items, total paid
- [ ] Cart cleared after successful order (badge shows 0, cart empty)
- [ ] **Web:** Confirmation page accessible at `/order/[id]/confirmation`
- [ ] **Web:** Reload confirmation page -- content still displayed
- [ ] **Mobile:** Confirmation screen renders with order details

### Story 4-6: Cross-Device Cart Sync

**Priority:** P1 | **Platform:** Both

**Preconditions:** Logged in with same account on web browser and mobile emulator.

- [ ] Add item to cart on web -- same item appears in mobile cart
- [ ] Modify quantity on mobile -- web cart updates within ~1 second (Realtime)
- [ ] Remove item on web -- mobile cart updates
- [ ] Anonymous user adds to cart, then logs in -- cart ownership transfers to account
- [ ] Cart merge: if authenticated cart and anonymous cart have same SKU -- quantities combine

### Story 4-7: Checkout Error Handling & Edge Cases

**Priority:** P0 | **Platform:** Both

**Preconditions:** Cart with items.

- [ ] Bag-level error displayed next to the merchant section (not generic page error)
- [ ] Inventory validation failure: message indicates which items are unavailable
- [ ] Network timeout during checkout -- retry prompt shown to user
- [ ] Invalid/expired cart state -- user guided to create new cart
- [ ] Errors logged to `error_logs` table in Supabase (check Studio)
- [ ] Navigate away from checkout and return -- form state preserved
- [ ] Multiple rapid "Place Order" clicks -- only one submission processed

---

## Epic 5: Orders (P1)

### Story 5-1: Order Confirmation & Data Persistence

**Priority:** P1 | **Platform:** Both

**Preconditions:** Successfully completed checkout (Story 4-4 or 4-5).

- [ ] Order persisted in Supabase: check `orders` table (has row with correct total)
- [ ] `order_bags` table has rows per merchant bag
- [ ] `order_items` table has rows per line item
- [ ] Confirmation page shows: order ID, items per merchant, grand total
- [ ] Guest order: lookup token displayed on confirmation with "Copy" button
- [ ] Click "Copy" -- token copied to clipboard (verify paste)
- [ ] Email notification queued (check `notification_logs` table or email service)

### Story 5-2: Order Status Webhooks Processing

**Priority:** P0 | **Platform:** Backend-only

**Preconditions:** Order exists in database, webhook Edge Function running.

- [ ] `ORDER_UPDATED` webhook updates order status in `orders` table
- [ ] `BAG_SHIPPED` webhook stores tracking number and carrier in `order_bags`
- [ ] Mixed bag statuses: order shows "Partially Shipped" (e.g., 1 bag shipped, 1 processing)
- [ ] Realtime: connected client receives order status update without page refresh
- [ ] Duplicate webhook (same event ID) does not create duplicate status entries

### Story 5-3: Unified Order Tracking View

**Priority:** P1 | **Platform:** Both

**Preconditions:** Logged-in user with at least 2 orders (different statuses).

- [ ] **Web:** Navigate to `/account/orders` -- all orders listed in reverse chronological order
- [ ] **Web:** Order card shows: order ID, date, status, total
- [ ] **Web:** Click order -- detail page with per-merchant bags
- [ ] **Web:** Status labels are human-friendly: "Processing", "Shipped", "Delivered" (not raw codes)
- [ ] **Web:** Tracking number is a clickable link (if carrier URL available)
- [ ] **Web:** Navigate to `/account/orders` while unauthenticated -- redirect to login
- [ ] **Web:** Realtime: leave page open, trigger status webhook -- status updates without refresh
- [ ] **Mobile:** Orders screen shows order list
- [ ] **Mobile:** Tap order to see detail
- [ ] **Both:** No orders: empty state with CTA "Browse Products" linking to catalog

### Story 5-4: Guest Order Lookup

**Priority:** P1 | **Platform:** Both

**Preconditions:** Guest order exists with known lookup token.

- [ ] **Web:** Navigate to `/order/lookup?token=<valid-token>` -- order detail displayed
- [ ] **Web:** Navigate to `/order/lookup` (no token) -- email input form shown
- [ ] **Web:** Enter email -- OTP sent to email
- [ ] **Web:** Enter valid OTP -- order list for that email displayed
- [ ] **Web:** Enter invalid token -- "Order not found" message (no info leakage about existence)
- [ ] **Web:** Rate limiting: submit OTP 4 times in 1 hour -- rate limit error on 4th attempt
- [ ] **Mobile:** "Track an Order" option in profile/settings screen
- [ ] **Mobile:** Token-based lookup works

### Story 5-5: Refund Processing & Communication

**Priority:** P1 | **Platform:** Backend-only

**Preconditions:** Order exists, refund webhook available.

- [ ] `BAG_REFUNDED` webhook updates bag status to "Refunded" in `order_bags`
- [ ] Refund details stored in `order_refunds` table (amount, reason, timestamp)
- [ ] Order detail page shows refund notice with refunded amount
- [ ] Refund notification email triggered (check `notification_logs`)

### Story 5-6: Email Notifications Pipeline

**Priority:** P1 | **Platform:** Backend-only

**Preconditions:** Order completed, email service configured.

- [ ] `order_confirmed` email sent after successful checkout (check email or logs)
- [ ] Email contains: order ID, item list, total amount
- [ ] `bag_shipped` email includes tracking link
- [ ] `bag_delivered` email sent when delivery confirmed
- [ ] `refund_processed` email includes refund amount
- [ ] Guest emails: tracking link uses `/order/lookup?token=xxx` URL
- [ ] Authenticated emails: tracking link uses `/account/orders/[id]` URL
- [ ] Failed email delivery logged in `notification_logs` table
- [ ] Email content has no raw HTML/template variables visible

---

## Epic 6: Personalization (P2)

### Story 6-1: User Account & Profile Management

**Priority:** P1 | **Platform:** Both

**Preconditions:** Logged-in user account.

- [ ] **Web:** Navigate to `/account/profile` -- profile form displayed
- [ ] **Web:** Edit display name -- save -- name updated (check Supabase)
- [ ] **Web:** Edit avatar URL -- save -- avatar updates in header/profile
- [ ] **Web:** Change password form works (current password + new password)
- [ ] **Web:** Password change with wrong current password -- error shown
- [ ] **Mobile:** Profile tab shows profile editing screen
- [ ] **Mobile:** Can edit display name and save

### Story 6-2: Browsing History & Preference Tracking

**Priority:** P2 | **Platform:** Backend-only

**Preconditions:** Authenticated user, products available.

- [ ] View a product page -- `product_view` event recorded in `user_events` table
- [ ] Search for a term -- `search` event recorded in `user_events`
- [ ] Search same term within 60 seconds -- no duplicate event (dedup window)
- [ ] Search same term after 60 seconds -- new event recorded
- [ ] Anonymous user views product -- no event recorded in `user_events`
- [ ] No third-party analytics scripts loaded (check Network tab for external tracking calls)

### Story 6-3: Personalized Search Results

**Priority:** P2 | **Platform:** Both

**Preconditions:** Authenticated user with browsing history (viewed 5+ products, searched 3+ terms).

- [ ] Authenticated user searches -- results show "Results tailored to you" indicator
- [ ] New user (no history) searches -- standard results, no personalization indicator
- [ ] Profile preferences: personalization opt-out toggle visible
- [ ] Toggle opt-out ON -- search results no longer show "tailored" indicator
- [ ] Performance: search with personalization < 2.1s total (< 100ms additional vs. non-personalized)

### Story 6-4: Wishlist & Saved Items

**Priority:** P2 | **Platform:** Both

**Preconditions:** Authenticated user, products available.

- [ ] **Web:** Product cards show heart icon (only for authenticated users)
- [ ] **Web:** Click heart -- icon fills/changes color, toast "Added to wishlist"
- [ ] **Web:** Click filled heart again -- icon unfills, toast "Removed from wishlist"
- [ ] **Web:** Navigate to `/account/wishlist` -- wishlisted products displayed
- [ ] **Web:** Sold out wishlisted item shows "Sold Out" label with disabled "Add to Cart" button
- [ ] **Web:** Anonymous user -- no heart icon visible on product cards
- [ ] **Mobile:** Wishlist accessible for authenticated users
- [ ] **Mobile:** Heart icon on product cards works (toggle)
- [ ] **Mobile:** Badge dot on wishlist when items exist
- [ ] Check Supabase `wishlists` table -- entries match UI state

### Story 6-5: Product Recommendations

**Priority:** P2 | **Platform:** Both

**Preconditions:** Product embeddings generated, viewing a product with related items.

- [ ] Product detail page shows "You might also like" section below main content
- [ ] Section displays 4-8 product cards
- [ ] Current product NOT included in recommendations
- [ ] Loading skeleton visible while recommendations load
- [ ] Click recommended product -- navigates to that product's detail page
- [ ] Product with no embeddings -- "You might also like" section hidden gracefully (no error)

### Story 6-6: Recently Viewed Products

**Priority:** P2 | **Platform:** Both

**Preconditions:** User has viewed at least 3 products.

- [ ] Homepage shows "Recently Viewed" section
- [ ] Up to 12 products displayed
- [ ] Products in reverse chronological order (most recent first)
- [ ] **Web anonymous:** reads from localStorage (check Application > Local Storage)
- [ ] **Web authenticated:** reads from `user_events` table
- [ ] Section hidden if user has not viewed any products
- [ ] View a new product, return to home -- new product appears first in recently viewed

### Story 6-7: Push Notification Infrastructure & Preferences

**Priority:** P2 | **Platform:** Mobile only

**Preconditions:** Authenticated user on mobile, push notifications enabled in emulator.

- [ ] App requests push permission with value proposition message (not raw system dialog)
- [ ] Accept permission -- push token stored in Supabase (check `push_tokens` table)
- [ ] Notification preferences screen accessible from profile/settings
- [ ] Per-type toggles visible: Order Updates, Shipping, Promotions (or similar)
- [ ] Toggle off "Promotions" -- save -- preference persisted
- [ ] Transactional notification received on order status change
- [ ] Anti-spam: max 1 engagement/promotional push per day enforced

### Story 6-8: Deep Linking & Universal Links

**Priority:** P2 | **Platform:** Mobile only

**Preconditions:** App installed on emulator, deep link configuration active.

- [ ] Open product URL in emulator browser -- app opens to product detail screen
- [ ] URL `/products/[id]` resolves to correct product in app
- [ ] URL `/order/[id]/confirmation` opens confirmation screen in app
- [ ] URL query parameters preserved through deep link
- [ ] If app not installed -- URL opens in mobile browser (graceful fallback)

---

## Epic 7: Content & SEO (P2)

### Story 7-1: Editorial Content Pages

**Priority:** P2 | **Platform:** Both

**Preconditions:** Content pages seeded in `content_pages` table (status: published).

- [ ] **Web:** Navigate to `/content/[slug]` -- page renders with content (SSR: check View Source)
- [ ] **Web:** Content shows: title, author name, publication date, body text
- [ ] **Web:** Product embeds in content render as interactive cards (clickable to product)
- [ ] **Web:** Affiliate disclosure visible on content page
- [ ] **Mobile:** Content screen renders with readable formatting
- [ ] **Both:** Draft content not visible (check with a content row where status = 'draft')

### Story 7-2: Content Listing & Navigation

**Priority:** P2 | **Platform:** Both

**Preconditions:** Multiple content pages with different types (guide, comparison, review).

- [ ] **Web:** Navigate to `/content` -- card grid displayed
- [ ] **Web:** Cards show: image, title, excerpt, content type badge
- [ ] **Web:** Type filter chips: Guides, Comparisons, Reviews, All
- [ ] **Web:** Click filter chip -- list filters to that type
- [ ] **Web:** "Load more" pagination works (if enough content)
- [ ] **Mobile:** Content listing with scrollable list
- [ ] **Both:** Empty state for type with no matching content
- [ ] **Both:** Click/tap content card -- navigates to content detail

### Story 7-3: Advanced SEO Implementation

**Priority:** P2 | **Platform:** Web only

**Preconditions:** Web app running with products and content.

- [ ] Every page has unique `<title>` (navigate to 3+ different pages, check each)
- [ ] Every page has unique `<meta name="description">` (check View Source)
- [ ] Product pages: `BreadcrumbList` JSON-LD present in source
- [ ] Content pages: `Article` JSON-LD present with `wordCount` property
- [ ] Homepage: `WebSite` and `Organization` JSON-LD present
- [ ] Canonical URLs: `<link rel="canonical">` set correctly on each page
- [ ] Auth pages (`/auth/*`): `<meta name="robots" content="noindex">` present
- [ ] Checkout pages (`/checkout/*`): `<meta name="robots" content="noindex">` present

### Story 7-4: Sitemap & Indexing

**Priority:** P3 | **Platform:** Backend-only

- [ ] `bun run generate:sitemap` produces XML file without errors
- [ ] Sitemap XML is valid (check structure: `<urlset>`, `<url>`, `<loc>`)
- [ ] Sitemap includes product URLs
- [ ] Sitemap includes content page URLs
- [ ] Sitemap excludes auth and checkout URLs
- [ ] `/robots.txt` contains `Sitemap:` directive pointing to sitemap URL

### Story 7-5: Social Sharing & Rich Previews

**Priority:** P2 | **Platform:** Both

**Preconditions:** Product and content pages loaded.

- [ ] **Web:** Product page has share button
- [ ] **Web:** Click share -- Web Share API opens (or URL copied to clipboard with toast)
- [ ] **Web:** Content page has share button
- [ ] **Web:** Open Graph meta tags present: `og:title`, `og:description`, `og:image` (View Source)
- [ ] **Mobile:** Share button on product detail opens native share sheet
- [ ] **Mobile:** Share includes product URL and title
- [ ] **Both:** Toast confirms share/copy action

### Story 7-6: Content Administration via Supabase Studio

**Priority:** P3 | **Platform:** Backend-only

**Preconditions:** Supabase Studio running.

- [ ] Open Supabase Studio > `content_pages` table -- can view, create, edit content
- [ ] Status field supports: `draft`, `published`, `archived`
- [ ] Set content to `draft` -- verify it disappears from `/content` listing
- [ ] Set content to `published` -- verify it appears on `/content` listing
- [ ] Set content to `archived` -- verify it disappears from listing
- [ ] `docs/content-administration-guide.md` exists in repository

---

## Epic 8: Admin & Operations (P2-P3)

### Story 8-1: FAQ & Help Center

**Priority:** P2 | **Platform:** Both

**Preconditions:** FAQ data seeded in database.

- [ ] **Web:** Navigate to `/help` -- FAQ page renders
- [ ] **Web:** FAQ questions grouped by category (Shipping, Returns, Payment, Tracking, Account)
- [ ] **Web:** Click question -- accordion expands to show answer
- [ ] **Web:** Click again -- accordion collapses
- [ ] **Web:** Keyboard: press Enter or Space on focused question -- toggles accordion
- [ ] **Web:** FAQ search input filters questions as you type
- [ ] **Web:** Search with no matches -- "No results" message
- [ ] **Mobile:** Help screen renders FAQ with expandable sections
- [ ] **Mobile:** Accordion interaction works with tap

### Story 8-2: Contact & Support Form

**Priority:** P2 | **Platform:** Both

**Preconditions:** Web and mobile running, email service configured.

- [ ] **Web:** Navigate to `/help/contact` -- contact form displayed
- [ ] **Web:** Form fields: name, email, subject (dropdown), message (textarea)
- [ ] **Web:** Submit empty form -- validation errors on required fields
- [ ] **Web:** Enter invalid email -- email format error
- [ ] **Web:** Enter message < 20 characters -- minimum length error
- [ ] **Web:** Enter message > 2000 characters -- maximum length error
- [ ] **Web:** Submit valid form -- confirmation message displayed
- [ ] **Web:** Check Supabase `support_inquiries` table -- new row created
- [ ] **Web:** Submit 4 forms with same email within 1 hour -- rate limit error on 4th
- [ ] **Mobile:** Contact screen accessible and functional
- [ ] **Mobile:** Form validation works identically

### Story 8-3: Analytics & Commission Dashboard

**Priority:** P3 | **Platform:** Web only (Admin)

**Preconditions:** Admin user logged in, orders exist in database.

- [ ] Navigate to `/admin` -- dashboard renders with metrics
- [ ] Metrics visible: total orders, revenue, commissions (or similar)
- [ ] Time range selector works (e.g., Last 7 days, Last 30 days, All time)
- [ ] Metrics update when time range changes
- [ ] Non-admin user navigates to `/admin` -- access denied or redirect to home
- [ ] Anonymous user navigates to `/admin` -- redirect to login

### Story 8-4: Support Inquiry Management

**Priority:** P3 | **Platform:** Web only (Admin)

**Preconditions:** Admin user logged in, support inquiries exist.

- [ ] Navigate to `/admin/support` -- inquiry list displayed
- [ ] List shows: subject, email, status, date
- [ ] Filter by status works (New, In Progress, Resolved)
- [ ] Click inquiry -- detail view shows full message
- [ ] Update status from "New" to "In Progress" -- status saved
- [ ] Update status to "Resolved" -- inquiry marked resolved
- [ ] Send reply email from detail view -- email sent (check logs)
- [ ] Non-admin cannot access this page

### Story 8-5: Platform Health Monitoring & Error Tracking

**Priority:** P3 | **Platform:** Web only (Admin)

**Preconditions:** Admin user logged in, `health-check` Edge Function deployed.

- [ ] Navigate to `/admin/health` -- health dashboard renders
- [ ] Dashboard shows: error rates, webhook success rates, API latency
- [ ] `health-check` Edge Function returns JSON with service statuses
- [ ] Each service shows status: healthy / degraded / down
- [ ] Alert thresholds configured (check `monitoring_alerts` table or config)
- [ ] Non-admin cannot access this page

### Story 8-6: Legal & Compliance Pages

**Priority:** P1 | **Platform:** Both

**Preconditions:** Legal content seeded (migration applied), web and mobile running.

- [ ] **Web:** Navigate to `/legal/privacy` -- Privacy Policy page renders
- [ ] **Web:** Navigate to `/legal/terms` -- Terms of Service page renders
- [ ] **Web:** Navigate to `/legal/cookies` -- Cookie Policy page renders
- [ ] **Web:** All three pages have meaningful content (not placeholder text)
- [ ] **Web:** Footer contains links to all three legal pages
- [ ] **Web:** Click footer "Privacy Policy" link -- navigates to `/legal/privacy`
- [ ] **Web:** Click footer "Terms of Service" link -- navigates to `/legal/terms`
- [ ] **Web:** Click footer "Cookie Preferences" link -- navigates to `/legal/cookies`
- [ ] **Web:** First visit (clear localStorage) -- cookie consent banner appears at bottom
- [ ] **Web:** Banner has "Accept" and "Decline" buttons of equal size and visual weight
- [ ] **Web:** No pre-checked boxes in banner
- [ ] **Web:** Banner includes link to Cookie Policy page
- [ ] **Web:** Click "Accept" -- banner disappears, preference stored in localStorage
- [ ] **Web:** Reload page -- banner does NOT reappear
- [ ] **Web:** Clear localStorage, reload, click "Decline" -- banner disappears, preference stored
- [ ] **Mobile:** Legal pages accessible from profile/settings screen
- [ ] **Mobile:** Privacy policy content renders correctly
- [ ] **Web:** Privacy policy covers: data collection, usage, user rights, contact info

---

## Post-Test Checklist

### Results Summary

| Priority | Total Tests | Passed | Failed | Blocked |
|----------|------------|--------|--------|---------|
| P0       |            |        |        |         |
| P1       |            |        |        |         |
| P2       |            |        |        |         |
| P3       |            |        |        |         |

### Sign-off Criteria

- [ ] **All P0 tests passed** -- mandatory for release
- [ ] **All P1 tests passed** -- mandatory for release
- [ ] P2 failures documented with screenshots and reproduction steps
- [ ] P3 failures documented (acceptable to defer to next sprint)
- [ ] Bugs filed in issue tracker with:
  - Title: `[Epic X / Story X-Y] Brief description`
  - Priority label matching test priority
  - Steps to reproduce
  - Expected vs. actual result
  - Screenshot or screen recording
  - Platform (Web / Mobile / Both)
  - Browser/emulator version

### Environment Teardown

- [ ] `supabase stop` -- local Supabase stopped
- [ ] Test data cleaned (or database reset for next tester)
- [ ] Test results committed or shared with team

---

## Recommended Execution Order

Execute in dependency order. Each epic builds on the previous.

| Order | Epic | Priority | Est. Duration | Dependencies |
|-------|------|----------|---------------|--------------|
| 1     | Epic 1: Project Foundation | P3 | 30 min | None |
| 2     | Epic 2: Authentication | P0 | 1 hour | Epic 1 |
| 3     | Epic 3: Product Discovery | P1 | 1.5 hours | Epic 2 |
| 4     | Epic 4: Cart & Checkout | P0 | 2 hours | Epic 3 |
| 5     | Epic 5: Orders | P1 | 1.5 hours | Epic 4 |
| 6     | Epic 6: Personalization | P2 | 1.5 hours | Epic 2, 3 |
| 7     | Epic 7: Content & SEO | P2 | 1 hour | Epic 1 |
| 8     | Epic 8: Admin & Operations | P2-P3 | 1.5 hours | Epic 2, 5 |

**Total estimated time:** ~10.5 hours (1.5 working days)

---

*Document generated on 2026-03-28. Last updated 2026-03-28 after Epic 4 test session (5 bugs fixed). Update this plan when new stories are added or acceptance criteria change.*
